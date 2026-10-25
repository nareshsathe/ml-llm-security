"""
classify.py
-----------
Two-level modeling system:
  Stage 1 — binary safe/malicious classification + continuous risk score,
            using TF-IDF + domain-specific features (features.py), fed
            through a stacking ensemble (train_model.py).
  Stage 2 — ONLY runs if Stage 1 flags a prompt as malicious: a genuinely
            trained multi-class classifier predicts which kind of attack
            it is (train_attack_type_model.py), replacing the old
            keyword-only guess. If the Stage 2 model isn't available
            (e.g. a fresh clone that hasn't run train_attack_type_model.py
            yet), this falls back to the keyword heuristic rather than
            failing, so the service always degrades gracefully.
"""

import os
import re

import joblib
from scipy.sparse import csr_matrix, hstack

from preprocess import preprocess
from features import extract_features, extract_features_breakdown
from finance_features import (
    extract_finance_features,
    extract_finance_features_breakdown,
    FINANCE_ATTACK_PATTERNS,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

_vectorizer = None
_model = None
_attack_type_model = None
_attack_type_available = False


def _load():
    global _vectorizer, _model
    if _vectorizer is not None and _model is not None:
        _load_attack_type_model()
        return _vectorizer, _model

    vec_path = os.path.join(MODELS_DIR, "vectorizer.pkl")
    model_path = os.path.join(MODELS_DIR, "ensemble_model.pkl")

    if os.path.exists(vec_path) and os.path.exists(model_path):
        try:
            vectorizer = joblib.load(vec_path)
            model = joblib.load(model_path)
            # Smoke-test immediately with the SAME combined-feature shape the
            # model was actually trained on (TF-IDF + 9 domain features) —
            # a stale pickle trained under a different scikit-learn version,
            # OR a stale pickle trained without domain features, both need
            # to be caught here so we self-heal instead of 500ing later.
            smoke_tfidf = vectorizer.transform(["startup smoke test"])
            smoke_domain = csr_matrix(extract_features("startup smoke test").reshape(1, -1))
            smoke_combined = hstack([smoke_tfidf, smoke_domain], format="csr")
            model.predict_proba(smoke_combined)
            _vectorizer, _model = vectorizer, model
            _load_attack_type_model()
            return _vectorizer, _model
        except Exception as e:
            print(f"[classify] Existing model artifacts are incompatible ({e}). Retraining to match...")

    _retrain_and_reload()
    return _vectorizer, _model


def _load_attack_type_model():
    """Stage 2 is optional — loaded best-effort. If missing/incompatible,
    classify_prompt() falls back to the keyword heuristic automatically."""
    global _attack_type_model, _attack_type_available
    if _attack_type_available:
        return
    path = os.path.join(MODELS_DIR, "attack_type_model.pkl")
    if os.path.exists(path):
        try:
            _attack_type_model = joblib.load(path)
            _attack_type_available = True
            print("[classify] Stage 2 attack-type model loaded ✓")
        except Exception as e:
            print(f"[classify] Stage 2 model present but failed to load ({e}) — "
                  f"falling back to keyword-based attack-type guessing.")


def _retrain_and_reload():
    """Regenerate dataset (if missing) + retrain, using whatever scikit-learn
    is actually installed right now, so the pickle can never be stale."""
    global _vectorizer, _model
    import subprocess
    import sys

    data_path = os.path.join(BASE_DIR, "data", "dataset.csv")
    if not os.path.exists(data_path):
        print("[classify] No dataset found — generating synthetic dataset...")
        subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "data", "generate_dataset.py")],
            check=True, cwd=os.path.join(BASE_DIR, "data"),
        )

    print("[classify] Training Stage 1 model with the currently installed scikit-learn...")
    subprocess.run(
        [sys.executable, os.path.join(BASE_DIR, "train_model.py")],
        check=True, cwd=BASE_DIR,
    )

    _vectorizer = joblib.load(os.path.join(MODELS_DIR, "vectorizer.pkl"))
    _model = joblib.load(os.path.join(MODELS_DIR, "ensemble_model.pkl"))
    print("[classify] Stage 1 retraining complete — model artifacts are now compatible ✓")

    # Best-effort: also (re)train Stage 2 so a fresh clone gets the real
    # attack-type classifier, not just the keyword fallback.
    try:
        print("[classify] Training Stage 2 attack-type model...")
        subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, "train_attack_type_model.py")],
            check=True, cwd=BASE_DIR,
        )
        _load_attack_type_model()
    except Exception as e:
        print(f"[classify] Stage 2 training failed ({e}) — will use keyword fallback.")


def is_loaded() -> bool:
    """Return True only when Stage 1 model artifacts are in memory.
    (Stage 2 is optional and does not gate readiness.)"""
    return _vectorizer is not None and _model is not None


# Keyword fallback — used only if Stage 2's trained model isn't available.
ATTACK_PATTERNS = [
    ("Jailbreak", re.compile(r"\b(dan|developer mode|jailbreak|no restrictions|unfiltered|no content policy)\b", re.I)),
    ("Prompt Injection", re.compile(r"\b(ignore (all|the|prior|previous)|disregard|system override|forget everything)\b", re.I)),
    ("Data Extraction", re.compile(r"\b(password|api key|credential|database|dump|env file|token|credit card)\b", re.I)),
    ("Role Manipulation", re.compile(r"\b(pretend you are|act as|roleplay|you are now)\b", re.I)),
]

# Finance-specific keyword fallback (prepended when domain='finance' so
# finance attacks take precedence over generic patterns in the fallback path).
# The real ML Stage 2 model is domain-agnostic; these kick in when it is absent.


def guess_attack_type_keyword(raw_text: str, domain: str = None) -> str:
    # When in finance domain, check finance-specific patterns first.
    if domain == "finance":
        for label, pattern in FINANCE_ATTACK_PATTERNS:
            if pattern.search(raw_text):
                return label
    for label, pattern in ATTACK_PATTERNS:
        if pattern.search(raw_text):
            return label
    return "Other"


def predict_attack_type(raw_text: str, cleaned: str, tfidf_vec, domain: str = None) -> dict:
    """Stage 2: real ML classification if available, keyword fallback otherwise.
    When domain='finance', finance attack patterns are preferred in the fallback path.
    """
    if _attack_type_available and _attack_type_model is not None:
        domain_vec = csr_matrix(extract_features(raw_text).reshape(1, -1))
        combined = hstack([tfidf_vec, domain_vec], format="csr")
        pred = _attack_type_model.predict(combined)[0]
        return {"attack_type": pred, "attack_type_source": "ml_model"}
    return {
        "attack_type": guess_attack_type_keyword(raw_text, domain=domain),
        "attack_type_source": "keyword_fallback",
    }


def score_to_action(risk_score: float) -> str:
    if risk_score >= 0.70:
        return "BLOCK"
    elif risk_score >= 0.40:
        return "WARN"
    return "ALLOW"


def classify_prompt(raw_text: str, domain: str = None) -> dict:
    """
    Classify a prompt and return a risk assessment.

    Parameters
    ----------
    raw_text : str
        The user's raw input prompt.
    domain : str, optional
        Deployment domain context.  Currently supported value: ``"finance"``.
        When provided, finance-specific feature signals are computed and
        merged into the feature vector, boosting detection of financial
        threats (PII exfiltration, fraud instructions, regulatory bypass, etc.).
        Defaults to ``None`` (generalized mode — behaviour is identical to
        the original pipeline).
    """
    vectorizer, model = _load()
    cleaned = preprocess(raw_text)
    tfidf_vec = vectorizer.transform([cleaned])
    generic_vec = csr_matrix(extract_features(raw_text).reshape(1, -1))

    # --- Finance domain: augment feature vector with finance-specific signals
    if domain == "finance":
        finance_vec = csr_matrix(extract_finance_features(raw_text).reshape(1, -1))
        combined = hstack([tfidf_vec, generic_vec, finance_vec], format="csr")
    else:
        combined = hstack([tfidf_vec, generic_vec], format="csr")

    try:
        proba = model.predict_proba(combined)[0]
        risk_score = round(float(proba[1]), 4)
    except ValueError:
        # Model was trained without finance features; fall back to generic shape.
        # This happens on a first run after adding the finance domain before retraining.
        combined_fallback = hstack([tfidf_vec, generic_vec], format="csr")
        proba = model.predict_proba(combined_fallback)[0]
        risk_score = round(float(proba[1]), 4)

    # Finance domain: if any high-confidence finance threat signal fires,
    # escalate risk_score to ensure WARN or BLOCK is triggered even when
    # the generic model gives a borderline score.
    if domain == "finance":
        fin_feats = extract_finance_features(raw_text)
        n_finance_signals = int(fin_feats.sum())
        if n_finance_signals >= 2:
            # Multiple finance signals strongly indicate a threat — push to BLOCK
            risk_score = max(risk_score, 0.75)
        elif n_finance_signals == 1:
            # Single finance signal — at minimum flag as WARN
            risk_score = max(risk_score, 0.42)

    action = score_to_action(risk_score)
    # label now derives from the SAME threshold as action, not a separate 0.5
    # cutoff. WARN and BLOCK both count as "malicious" for logging and Stage 2
    # purposes; only ALLOW is "safe".
    label = "safe" if action == "ALLOW" else "malicious"

    if label == "malicious":
        stage2 = predict_attack_type(raw_text, cleaned, tfidf_vec, domain=domain)
        attack_type = stage2["attack_type"]
        attack_type_source = stage2["attack_type_source"]
    else:
        attack_type = "None"
        attack_type_source = "n/a"

    result = {
        "label": label,
        "risk_score": risk_score,
        "action": action,
        "attack_type": attack_type,
        "attack_type_source": attack_type_source,
        "domain_features": extract_features_breakdown(raw_text),
    }

    # Attach finance-specific breakdown when in finance domain mode
    if domain == "finance":
        result["finance_signals"] = extract_finance_features_breakdown(raw_text)

    return result
