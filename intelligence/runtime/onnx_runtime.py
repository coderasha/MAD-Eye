"""ONNX loading with a checksum gate.

A manifest without weights is a hard stop. This module does not download
weights and does not substitute another recogniser.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import onnxruntime as ort
from pydantic import BaseModel, ConfigDict, Field

from core.errors import ModelIntegrityError, ModelWeightsNotRegistered


class ModelManifest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model_code: str = Field(alias="modelCode")
    version: str
    status: str
    weights_path: str | None = Field(default=None, alias="weightsPath")
    weights_sha256: str | None = Field(default=None, alias="weightsSha256")
    benchmark_validated: bool = Field(default=False, alias="benchmarkValidated")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_session(manifest: ModelManifest, root: Path) -> ort.InferenceSession:
    if not manifest.weights_path or not manifest.weights_sha256:
        raise ModelWeightsNotRegistered(manifest.model_code)
    path = (root / manifest.weights_path).resolve()
    if not path.is_file():
        raise ModelWeightsNotRegistered(manifest.model_code)
    actual = sha256_file(path)
    if actual != manifest.weights_sha256:
        raise ModelIntegrityError(manifest.model_code)
    return ort.InferenceSession(path.read_bytes(), providers=["CPUExecutionProvider"])
