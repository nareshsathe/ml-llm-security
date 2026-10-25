FROM python:3.11-slim

WORKDIR /app

# Install curl/ca-certificates for SSL in restricted Docker environments,
# tesseract-ocr for image text extraction, and ffmpeg for video frame/audio
# extraction — all three are used by multimodal.py.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tesseract-ocr ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir \
        --trusted-host pypi.org \
        --trusted-host files.pythonhosted.org \
        -r requirements.txt \
    && python -c "\
import ssl; \
ssl._create_default_https_context = ssl._create_unverified_context; \
import nltk; \
nltk.download('stopwords', download_dir='/usr/local/nltk_data', quiet=True); \
nltk.download('wordnet', download_dir='/usr/local/nltk_data', quiet=True); \
nltk.download('punkt', download_dir='/usr/local/nltk_data', quiet=True); \
nltk.download('punkt_tab', download_dir='/usr/local/nltk_data', quiet=True); \
nltk.download('omw-1.4', download_dir='/usr/local/nltk_data', quiet=True); \
" \
    && curl -k -L -o /tmp/en_core_web_sm-3.7.1-py3-none-any.whl \
        https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl \
    && pip install --no-cache-dir /tmp/en_core_web_sm-3.7.1-py3-none-any.whl \
    && rm /tmp/en_core_web_sm-3.7.1-py3-none-any.whl

ENV NLTK_DATA=/usr/local/nltk_data

# Copy the full app (including pre-trained model artifacts if they exist on host)
COPY app/ ./app

WORKDIR /app/app

# ---------------------------------------------------------------------------
# Build-time safety net: if the host's pre-trained .pkl files were not copied
# (e.g. fresh clone with no local training run), train them now so the image
# is always self-contained and the service starts with model_loaded = true.
# ---------------------------------------------------------------------------
RUN if [ ! -f "models/ensemble_model.pkl" ] || [ ! -f "models/vectorizer.pkl" ]; then \
        echo "[build] Model artifacts missing — training now (this may take a few minutes)..."; \
        python train_model.py; \
    else \
        echo "[build] Model artifacts found — skipping training."; \
    fi

RUN if [ ! -f "models/attack_type_model.pkl" ]; then \
        echo "[build] Stage 2 attack-type model missing — training now..."; \
        python train_attack_type_model.py; \
    else \
        echo "[build] Stage 2 attack-type model found — skipping training."; \
    fi

# If pre-trained model artifacts aren't already baked in, train on container start.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
