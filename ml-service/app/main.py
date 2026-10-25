"""
main.py — FastAPI ML Service
-----------------------------
Exposes:
    POST /classify   -> classify a single prompt, return risk score/action
    POST /batch       -> classify a list of prompts
    POST /filter       -> NER+regex filter an LLM response before it reaches the user
    GET  /health      -> liveness/readiness probe (checks model artifacts loaded)

Run directly:
    uvicorn main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from typing import List

import traceback

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from classify import classify_prompt, is_loaded, _load
from response_filter import filter_response
from multimodal import (
    extract_text_from_image,
    transcribe_audio,
    extract_text_from_video,
    ExtractionError,
)

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB — generous for a demo, prevents abuse


# ---------------------------------------------------------------------------
# Lifespan: eagerly load model artifacts at startup so the first real request
# is never the one that triggers a cold-load.  Failures are logged but do NOT
# crash the server — the health endpoint will report "degraded" instead and
# the /classify endpoint returns 503 until the model is ready.
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Loading model artifacts...")
    try:
        _load()
        print("[startup] Model artifacts loaded successfully ✓")
    except Exception as exc:
        print(f"[startup] WARNING — model loading failed: {exc}")
        print("[startup] Service will report 'degraded' until artifacts are available.")
    yield
    # (shutdown hook — nothing to clean up for joblib/sklearn models)


app = FastAPI(
    title="ML-Based LLM Security System — Classification Service",
    description="Prompt injection / jailbreak detection + response filtering microservice",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)


class PromptRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    domain: str = Field(None, description="Optional deployment domain, e.g. 'finance'")


class BatchRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1, max_items=100)
    domain: str = Field(None, description="Optional deployment domain, e.g. 'finance'")


class FilterRequest(BaseModel):
    text: str
    domain: str = Field(None, description="Optional deployment domain, e.g. 'finance'")


# ---------------------------------------------------------------------------
# /health  — lightweight readiness probe.
# Checks in-memory state (is_loaded) rather than running a full classification,
# so the probe itself never causes errors or wastes CPU on repeated calls.
# If the model failed to load at startup, try once more here so a later
# docker-healthcheck can eventually see "ok" after a transient failure.
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    if not is_loaded():
        # Attempt a recovery load in case the Dockerfile baked models in after
        # uvicorn started (e.g. entrypoint trained them asynchronously).
        try:
            _load()
        except Exception:
            pass

    model_ok = is_loaded()
    return {
        "status": "ok" if model_ok else "degraded",
        "model_loaded": model_ok,
    }


# ---------------------------------------------------------------------------
# /classify
# ---------------------------------------------------------------------------
@app.post("/classify")
def classify(req: PromptRequest):
    if not is_loaded():
        raise HTTPException(
            status_code=503,
            detail="Model not ready. Check /health for details.",
        )
    try:
        result = classify_prompt(req.text, domain=req.domain)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")


# ---------------------------------------------------------------------------
# /batch
# ---------------------------------------------------------------------------
@app.post("/batch")
def batch_classify(req: BatchRequest):
    if not is_loaded():
        raise HTTPException(
            status_code=503,
            detail="Model not ready. Check /health for details.",
        )
    try:
        return {"results": [classify_prompt(t, domain=req.domain) for t in req.texts]}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ---------------------------------------------------------------------------
# /filter
# ---------------------------------------------------------------------------
@app.post("/filter")
def filter_llm_response(req: FilterRequest):
    try:
        return filter_response(req.text, domain=req.domain)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Response filtering failed: {e}")


# ---------------------------------------------------------------------------
# Multimodal helper — runs classify_prompt() on whatever text was extracted,
# and attaches the extracted text to the response for transparency (a
# reviewer/user can see exactly what the OCR/transcription produced, not
# just trust it silently).
# ---------------------------------------------------------------------------
def _classify_extracted_text(extracted_text: str, source_field_name: str, extra_fields: dict = None):
    if not is_loaded():
        raise HTTPException(status_code=503, detail="Model not ready. Check /health for details.")
    if not extracted_text:
        # Nothing recognizable came out of the file — safest default is to
        # treat it as low-risk empty input rather than guessing, but callers
        # should surface this clearly rather than silently allowing it.
        raise HTTPException(
            status_code=422,
            detail="No text could be extracted from the file (empty OCR/transcription result).",
        )
    try:
        result = classify_prompt(extracted_text)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Classification failed: {e}")
    result[source_field_name] = extracted_text
    if extra_fields:
        result.update(extra_fields)
    return result


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024*1024)}MB limit.")
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")
    return data


# ---------------------------------------------------------------------------
# /classify/image — OCR the image, then run the SAME text classifier used by
# /classify. No external API needed (Tesseract runs locally).
# ---------------------------------------------------------------------------
@app.post("/classify/image")
async def classify_image(file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        text = extract_text_from_image(data)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _classify_extracted_text(text, "extracted_text")


# ---------------------------------------------------------------------------
# /classify/audio — transcribe via Groq Whisper, then run the same classifier.
# Requires GROQ_API_KEY to be set for the ML service.
# ---------------------------------------------------------------------------
@app.post("/classify/audio")
async def classify_audio(file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        text = transcribe_audio(data, filename=file.filename or "audio.wav")
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _classify_extracted_text(text, "extracted_text")


# ---------------------------------------------------------------------------
# /classify/video — sample frames (OCR each) + extract audio track
# (transcribe), combine both into one text, then run the same classifier.
# ---------------------------------------------------------------------------
@app.post("/classify/video")
async def classify_video(file: UploadFile = File(...)):
    data = await _read_upload(file)
    try:
        extraction = extract_text_from_video(data)
    except ExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _classify_extracted_text(
        extraction["combined_text"],
        "extracted_text",
        extra_fields={
            "ocr_text": extraction["ocr_text"],
            "audio_text": extraction["audio_text"],
            "frames_sampled": extraction["frames_sampled"],
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
