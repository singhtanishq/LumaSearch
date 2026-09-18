"""LumaSearch local embedding service.

Wraps sentence-transformers behind a small HTTP API so the Node worker can
generate embeddings without a Python-native client. Batches and caches are
handled on the Node side; this service stays stateless.
"""
import time
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="LumaSearch Embeddings", version="0.1.0")

_model = None
_model_name = None


def _load_model(name: str):
    global _model, _model_name
    if _model is None or _model_name != name:
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(name)
            _model_name = name
        except Exception as exc:  # pragma: no cover - depends on runtime env
            raise HTTPException(status_code=503, detail=f"model load failed: {exc}")
    return _model


class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., max_length=512)
    model: str = "sentence-transformers/all-MiniLM-L6-v2"


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int
    model: str
    took_ms: int


@app.get("/health")
def health():
    return {"status": "ok", "model": _model_name}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=422, detail="texts must not be empty")
    started = time.perf_counter()
    model = _load_model(req.model)
    vectors = model.encode(req.texts, batch_size=32, show_progress_bar=False)
    took_ms = int((time.perf_counter() - started) * 1000)
    return EmbedResponse(
        embeddings=[v.tolist() for v in vectors],
        dimensions=len(vectors[0]),
        model=req.model,
        took_ms=took_ms,
    )