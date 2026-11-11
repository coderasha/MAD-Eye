"""Load a registered ME-04 ONNX checkpoint.

Absence of the manifest is a hard stop. This module does not download weights
and does not call another OCR engine.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np

from core.errors import ModelWeightsNotRegistered
from runtime.onnx_runtime import ModelManifest, load_session
from services.recognition.ctc import decode_charset, greedy_decode, prepare_line


class PrintedRecognizer:
    def __init__(self, manifest: ModelManifest, charset: str, session: object, dataset: str | None, synthetic_cer: float | None, synthetic_wer: float | None) -> None:
        self.manifest = manifest
        self.charset = charset
        self.session = session
        self.dataset = dataset
        self.synthetic_cer = synthetic_cer
        self.synthetic_wer = synthetic_wer

    def recognise_line(self, image: np.ndarray) -> tuple[str, float]:
        tensor = prepare_line(image)
        input_name = self.session.get_inputs()[0].name  # type: ignore[attr-defined]
        logits = self.session.run(None, {input_name: tensor})[0]  # type: ignore[attr-defined]
        indices, confidence = greedy_decode(np.asarray(logits)[0])
        return decode_charset(indices, self.charset), confidence


def load_printed_recogniser() -> PrintedRecognizer:
    manifest_path = os.environ.get("MADEYE_ME04_MANIFEST", "").strip()
    if not manifest_path:
        raise ModelWeightsNotRegistered("me-04-printed-recognition")
    path = Path(manifest_path)
    if not path.is_file():
        raise ModelWeightsNotRegistered("me-04-printed-recognition")
    payload = json.loads(path.read_text(encoding="utf-8"))
    manifest = ModelManifest.model_validate(payload)
    session = load_session(manifest, path.parent)
    charset = str(payload.get("charset") or "")
    if not charset:
        raise ModelWeightsNotRegistered("me-04-printed-recognition")
    return PrintedRecognizer(
        manifest=manifest,
        charset=charset,
        session=session,
        dataset=payload.get("dataset"),
        synthetic_cer=_optional_float(payload.get("syntheticCer")),
        synthetic_wer=_optional_float(payload.get("syntheticWer")),
    )


def current_recogniser() -> PrintedRecognizer:
    manifest_path = os.environ.get("MADEYE_ME04_MANIFEST", "").strip()
    return _cached(manifest_path)


@lru_cache(maxsize=2)
def _cached(manifest_path: str) -> PrintedRecognizer:
    if not manifest_path:
        raise ModelWeightsNotRegistered("me-04-printed-recognition")
    return load_printed_recogniser()


def _optional_float(value: object) -> float | None:
    if value is None:
        return None
    return float(value)  # type: ignore[arg-type]
