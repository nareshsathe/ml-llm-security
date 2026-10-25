"""
train_model.py
---------------
Stage 1 of the two-level modeling system: binary safe/malicious classifier.

Feature representation = TF-IDF (5,000 features, unigrams+bigrams) combined
with hand-engineered domain-specific features (features.py) — instruction-
override markers, persona markers, authority-claim markers, exfiltration-
target markers, and structural signals (length, capitalization ratio,
special-character ratio, Base64-like substrings, system-token markers).

The three base classifiers (tuned Logistic Regression, Random Forest, SVM)
are combined via a stacking meta-learner (see Q&A doc for the soft-voting
vs. stacking comparison).

For Stage 2 (attack-type classification, run only on prompts Stage 1 flags
as malicious), see train_attack_type_model.py.

Run:
    python train_model.py
Outputs (into app/models/):
    vectorizer.pkl          <- TF-IDF vectorizer (fit on training text only)
    ensemble_model.pkl      <- Stage 1 binary classifier (stacking ensemble)
    metrics.json            <- real measured metrics from THIS training run
"""

import json
import os
import time

import joblib
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, classification_report,
                              confusion_matrix, f1_score, precision_score,
                              recall_score)
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC

from preprocess import preprocess
from features import extract_features_batch

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "dataset.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)


def build_combined_features(vectorizer, raw_texts, clean_texts, fit=False):
    """TF-IDF (on cleaned text) horizontally stacked with domain-specific
    features (on raw text — several signals need the original punctuation
    and capitalization that preprocessing strips out)."""
    if fit:
        tfidf = vectorizer.fit_transform(clean_texts)
    else:
        tfidf = vectorizer.transform(clean_texts)
    domain_feats = csr_matrix(extract_features_batch(raw_texts))
    return hstack([tfidf, domain_feats], format="csr")


def main():
    print("Loading dataset...")
    df = pd.read_csv(DATA_PATH)
    df = df.dropna(subset=["text", "label"]).drop_duplicates(subset=["text"])
    print(f"  {len(df)} rows loaded  (safe={sum(df.label==0)}, malicious={sum(df.label==1)})")

    print("Preprocessing text...")
    df["clean_text"] = df["text"].astype(str).apply(preprocess)

    train_df, test_df = train_test_split(
        df, test_size=0.2, random_state=42, stratify=df["label"]
    )
    y_train, y_test = train_df["label"], test_df["label"]

    print("Fitting TF-IDF vectorizer + extracting domain-specific features...")
    vectorizer = TfidfVectorizer(
        max_features=5000,
        ngram_range=(1, 2),
        min_df=2,
        max_df=0.95,
        sublinear_tf=True,
    )
    X_train = build_combined_features(vectorizer, train_df["text"], train_df["clean_text"], fit=True)
    X_test = build_combined_features(vectorizer, test_df["text"], test_df["clean_text"], fit=False)
    print(f"  Combined feature matrix: {X_train.shape[1]} columns "
          f"(5000 TF-IDF + {X_train.shape[1] - 5000} domain features)")

    print("Training Logistic Regression (tuned), Random Forest, SVM -> stacking ensemble...")
    lr = LogisticRegression(C=10.0, class_weight="balanced", solver="liblinear", max_iter=2000, random_state=42)
    rf = RandomForestClassifier(n_estimators=100, random_state=42)
    svm = CalibratedClassifierCV(LinearSVC(C=1.0, max_iter=5000, random_state=42), cv=3)

    ensemble = StackingClassifier(
        estimators=[("lr", lr), ("rf", rf), ("svm", svm)],
        final_estimator=LogisticRegression(max_iter=1000),
        cv=5,
        passthrough=False,
        stack_method="predict_proba",
    )

    t0 = time.time()
    ensemble.fit(X_train, y_train)
    train_time = time.time() - t0

    print("Evaluating Stage 1 (binary safe/malicious)...")
    t0 = time.time()
    y_pred = ensemble.predict(X_test)
    infer_time_ms = (time.time() - t0) * 1000 / max(len(y_test), 1)

    metrics = {
        "stage": "1 (binary safe/malicious)",
        "ensemble_method": "stacking (logistic-regression meta-learner, 5-fold)",
        "feature_representation": "TF-IDF (5000) + 9 domain-specific features",
        "dataset_sources": "Safe-Guard Prompt Injection + AdvBench (merged, deduplicated)",
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "precision": round(precision_score(y_test, y_pred), 4),
        "recall": round(recall_score(y_test, y_pred), 4),
        "f1_score": round(f1_score(y_test, y_pred), 4),
        "false_positive_rate": None,
        "train_time_sec": round(train_time, 2),
        "avg_inference_time_ms": round(infer_time_ms, 3),
        "train_rows": len(train_df),
        "test_rows": len(test_df),
    }

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    metrics["false_positive_rate"] = round(fp / (fp + tn), 4) if (fp + tn) else 0.0
    metrics["confusion_matrix"] = {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}

    print("\n=== Stage 1 measured performance (real, from this training run) ===")
    for k, v in metrics.items():
        print(f"  {k}: {v}")
    print("\n" + classification_report(y_test, y_pred, target_names=["safe", "malicious"]))

    print("Saving Stage 1 artifacts...")
    joblib.dump(vectorizer, os.path.join(MODELS_DIR, "vectorizer.pkl"))
    joblib.dump(ensemble, os.path.join(MODELS_DIR, "ensemble_model.pkl"))
    with open(os.path.join(MODELS_DIR, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nStage 1 done. Artifacts saved in {MODELS_DIR}")
    print("Now run train_attack_type_model.py for Stage 2 (attack-type classification).")


if __name__ == "__main__":
    main()
