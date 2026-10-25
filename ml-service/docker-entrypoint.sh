#!/bin/sh
set -e

cd /app/app

if [ ! -f "models/ensemble_model.pkl" ]; then
  echo "[entrypoint] No trained model found — generating dataset and training now..."
  if [ ! -f "data/dataset.csv" ]; then
    python data/generate_dataset.py
  fi
  python train_model.py
fi

if [ ! -f "models/attack_type_model.pkl" ]; then
  echo "[entrypoint] No Stage 2 (attack-type) model found — training now..."
  python train_attack_type_model.py
fi

echo "[entrypoint] Starting FastAPI ML service on port 8000..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
