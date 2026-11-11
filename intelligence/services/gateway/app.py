"""FastAPI gateway. Recognition routes refuse instead of fabricating text."""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from core.capabilities import list_capabilities
from core.contracts import dump_contract
from core.errors import CapabilityNotImplemented, ModelIntegrityError, ModelWeightsNotRegistered, UnsupportedDocument
from pipelines.recognise import recognise_bytes
from services.preprocessing.pipeline import PreprocessOptions, preprocess_bytes

PAGES = Counter("madeye_preprocess_pages_total", "Pages completed by preprocessing", ["status"])
PREPROCESS_SECONDS = Histogram(
    "madeye_preprocess_seconds",
    "Wall time of a preprocess request",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60),
)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

logger = logging.getLogger("madeye.intelligence")


def create_app() -> FastAPI:
    app = FastAPI(
        title="MAD-EYE Intelligence",
        version="1.0.0",
        description="Document rendering, classical preprocessing, and ME-04 inference when weights are registered.",
    )

    @app.middleware("http")
    async def correlation(request: Request, call_next):
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Correlation-Id"] = correlation_id
        return response

    @app.get("/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "intelligence"}

    @app.get("/v1/capabilities")
    def capabilities() -> dict[str, object]:
        return {"contractVersion": "1.0.0", "capabilities": list_capabilities()}

    @app.get("/metrics")
    def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.post("/v1/preprocess")
    async def preprocess(
        file: UploadFile = File(...),
        dpi: int = Query(default=200, ge=72, le=400),
        include_binarized: bool = Query(default=False, alias="includeBinarized"),
        allow_experimental_deblur: bool = Query(default=False, alias="allowExperimentalDeblur"),
    ) -> JSONResponse:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail={"code": "FILE_TOO_LARGE", "message": "Upload exceeds 50 MiB"})
        if not data:
            raise HTTPException(status_code=400, detail={"code": "EMPTY_FILE", "message": "Upload is empty"})
        media_type = _media_type(data)
        started = time.perf_counter()
        try:
            result = preprocess_bytes(
                data,
                media_type,
                options=PreprocessOptions(
                    include_binarized=include_binarized,
                    allow_experimental_deblur=allow_experimental_deblur,
                    dpi=float(dpi),
                ),
            )
        except UnsupportedDocument as exc:
            raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
        elapsed = time.perf_counter() - started
        PREPROCESS_SECONDS.observe(elapsed)
        for page in result.pages:
            PAGES.labels(status=page.status).inc()
        logger.info(
            "preprocess_completed",
            extra={"pageCount": result.page_count, "errorCount": len(result.errors), "seconds": round(elapsed, 4)},
        )
        return JSONResponse(dump_contract(result))

    @app.post("/v1/recognise")
    async def recognise(
        file: UploadFile = File(...),
        dpi: int = Query(default=200, ge=72, le=400),
        labels: str = Query(default=""),
    ) -> JSONResponse:
        data = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail={"code": "FILE_TOO_LARGE", "message": "Upload exceeds 50 MiB"})
        if not data:
            raise HTTPException(status_code=400, detail={"code": "EMPTY_FILE", "message": "Upload is empty"})
        media_type = _media_type(data)
        requested = [part.strip() for part in labels.split(",") if part.strip()]
        try:
            result = recognise_bytes(data, media_type, labels=requested, dpi=dpi)
        except ModelWeightsNotRegistered as exc:
            raise HTTPException(
                status_code=501,
                detail={"code": exc.code, "capability": exc.model_code, "message": str(exc)},
            ) from exc
        except ModelIntegrityError as exc:
            raise HTTPException(status_code=409, detail={"code": exc.code, "message": str(exc)}) from exc
        except UnsupportedDocument as exc:
            raise HTTPException(status_code=422, detail={"code": exc.code, "message": str(exc)}) from exc
        return JSONResponse(dump_contract(result))

    @app.post("/v1/extract")
    def extract() -> None:
        _not_implemented("standalone_field_extraction")

    return app


def _not_implemented(capability: str) -> None:
    error = CapabilityNotImplemented(capability)
    raise HTTPException(
        status_code=501,
        detail={"code": error.code, "capability": capability, "message": str(error)},
    )


def _media_type(data: bytes) -> str:
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"II*\x00") or data.startswith(b"MM\x00*"):
        return "image/tiff"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(
        status_code=415,
        detail={"code": "UNSUPPORTED_MEDIA_TYPE", "message": "Only PDF, PNG, JPEG, TIFF, and WEBP are accepted"},
    )


app = create_app()
