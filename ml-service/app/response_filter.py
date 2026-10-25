"""
response_filter.py
-------------------
Stage 7: filters LLM-generated responses to redact sensitive data (PII, API
keys, tokens, card numbers) before returning them to the user.

Uses spaCy NER when available; always applies regex-based redaction for
structured secrets (API keys, tokens, card numbers, emails) regardless,
since regex is more reliable for those fixed-format patterns.
"""

import re

_REGEX_RULES = [
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"), "[KEY_REDACTED]"),
    (re.compile(r"gsk_[a-zA-Z0-9]{20,}"), "[KEY_REDACTED]"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{20,}"), "[KEY_REDACTED]"),
    (re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]+", re.I), "[TOKEN_REDACTED]"),
    (re.compile(r"\b\d{13,19}\b"), "[CARD_REDACTED]"),
    (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "[EMAIL_REDACTED]"),
    (re.compile(r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE_REDACTED]"),
]

# Finance-domain-specific redaction rules — only applied when domain="finance".
# These patterns target financial PII that is outside the generic ruleset above.
_FINANCE_REGEX_RULES = [
    # US Social Security Numbers
    (re.compile(r"\b\d{3}[- ]\d{2}[- ]\d{4}\b"), "[SSN_REDACTED]"),
    # ABA routing numbers (9 digits, common in wire transfer contexts)
    (re.compile(r"(?:routing\s*(?:number|num|no|#)?\s*[:=]?\s*)(\d{9})\b", re.I), "[ROUTING_REDACTED]"),
    # IBAN codes
    (re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b"), "[IBAN_REDACTED]"),
    # Bank account numbers in context
    (re.compile(
        r"(?:account\s*(?:number|num|no|#)?\s*[:=]?\s*)(\d{8,17})\b"
        r"|(?:checking|savings)\s+account\s+(\d{8,17})\b", re.I
    ), "[ACCOUNT_REDACTED]"),
    # Brokerage / trading account IDs (e.g. "12345678" after "account:")
    (re.compile(r"(?:brokerage|trading)\s+account\s*[:=]?\s*([A-Z0-9]{6,15})\b", re.I), "[BROKERAGE_ACCT_REDACTED]"),
]

_nlp = None
_NER_LABELS = {"PERSON", "GPE", "ORG", "EMAIL", "PHONE"}


def _load_spacy():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except Exception:
            _nlp = False  # sentinel: spaCy/model unavailable, regex-only fallback
    return _nlp


def filter_response(text: str, domain: str = None) -> dict:
    """
    Filter/redact sensitive data from an LLM response.

    Parameters
    ----------
    text : str
        The raw LLM-generated response text.
    domain : str, optional
        Deployment domain.  When ``"finance"``, additional finance-specific
        PII redaction rules (SSNs, routing numbers, IBANs, bank account
        numbers) are applied on top of the generic rules.
    """
    if not text:
        return {"filtered_text": text, "redactions": []}

    redactions = []
    filtered = text

    # Regex pass (structured secrets) — always runs
    for pattern, tag in _REGEX_RULES:
        matches = pattern.findall(filtered)
        if matches:
            redactions.append({"type": tag.strip("[]"), "count": len(matches)})
            filtered = pattern.sub(tag, filtered)

    # Finance-domain additional redaction pass
    if domain == "finance":
        for pattern, tag in _FINANCE_REGEX_RULES:
            matches = pattern.findall(filtered)
            if matches:
                redactions.append({"type": tag.strip("[]"), "count": len(matches)})
                filtered = pattern.sub(tag, filtered)

    # spaCy NER pass (named entities like PERSON) — best-effort, fail-safe:
    # any per-call spaCy error just skips this pass rather than crashing the
    # whole response filter (regex redactions above have already run).
    try:
        nlp = _load_spacy()
        if nlp:
            doc = nlp(filtered)
            for ent in doc.ents:
                if ent.label_ in ("PERSON",):
                    filtered = filtered.replace(ent.text, "[REDACTED]")
                    redactions.append({"type": "PERSON", "count": 1})
    except Exception as e:
        print(f"[response_filter] spaCy NER pass failed, skipping: {e}")

    return {"filtered_text": filtered, "redactions": redactions}


if __name__ == "__main__":
    sample = (
        "Sure, contact John Smith at john.smith@example.com or call "
        "555-123-4567. The API key is sk-abcd1234efgh5678ijkl9012."
    )
    print("Generic:", filter_response(sample))

    finance_sample = (
        "The client's SSN is 123-45-6789, routing number 021000021, "
        "account number 987654321, IBAN GB29NWBK60161331926819."
    )
    print("Finance:", filter_response(finance_sample, domain="finance"))
