"""Honest capability registry. Status values are code, not marketing."""

from __future__ import annotations

CAPABILITIES: list[dict[str, str]] = [
    {
        "id": "preprocessing",
        "status": "implemented",
        "summary": "Adaptive classical preprocessing. Originals are not overwritten.",
    },
    {
        "id": "pdf-rendering",
        "status": "implemented",
        "summary": "PyMuPDF renders pages. This is not text extraction.",
    },
    {
        "id": "me-01-vision-quality",
        "status": "classical_baseline",
        "summary": "Deterministic blur, noise, skew, contrast, shadow, and resolution measures. Not a trained model and not benchmark-validated.",
    },
    {
        "id": "me-02-script-intelligence",
        "status": "not_implemented",
        "summary": "Script and language identification is not implemented.",
    },
    {
        "id": "me-03-text-detection",
        "status": "classical_baseline",
        "summary": "Contour grouping finds text-line boxes. It is not a trained detector and it is not benchmark-validated.",
    },
    {
        "id": "me-04-printed-recognition",
        "status": "weights_required",
        "summary": "CNN+BiLSTM+CTC runs only when MADEYE_ME04_MANIFEST points at a checksummed ONNX file. A missing file returns no text. Synthetic checkpoints are not benchmark-validated.",
    },
    {
        "id": "me-05-handwriting",
        "status": "not_implemented",
        "summary": "Handwriting recognition is not implemented.",
    },
    {
        "id": "me-06-layout",
        "status": "not_implemented",
        "summary": "Layout analysis is not implemented.",
    },
    {
        "id": "me-07-tables",
        "status": "classical_baseline",
        "summary": "Ruled tables are reconstructed from measured horizontal and vertical lines. Unruled pages produce no table. Merged cells are not inferred. Not benchmark-validated.",
    },
    {
        "id": "me-08-classification",
        "status": "not_implemented",
        "summary": "Document classification is not implemented.",
    },
    {
        "id": "field-extraction",
        "status": "implemented",
        "summary": "Label strings are sought in recognised lines. A missing label is omitted and is never filled with invented text.",
    },
    {
        "id": "validation-rules",
        "status": "implemented",
        "summary": "Deterministic GSTIN checksum and date checks. They do not read documents by themselves.",
    },
    {
        "id": "confidence-states",
        "status": "implemented",
        "summary": "Output-state assignment and disagreement handling. Scores are not treated as calibrated.",
    },
]


def list_capabilities() -> list[dict[str, str]]:
    return [dict(item) for item in CAPABILITIES]
