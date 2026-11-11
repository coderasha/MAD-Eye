"""Preprocess, detect lines, and recognise with the registered ME-04 weights.

An unvalidated checkpoint cannot produce RECOGNISED. Its text is still the
network decode, and the state is capped at NEEDS_REVIEW.
"""

from __future__ import annotations

import base64

import cv2
import numpy as np

from core.contracts import (
    CONTRACT_VERSION,
    BoundingBox,
    ExtractedValue,
    ModelReport,
    PageError,
    Provenance,
    RecognitionPage,
    RecognisedLine,
    RecogniseResponse,
    TableCellResult,
    TableResult,
)
from core.errors import UnsupportedDocument
from services.confidence.states import assign_output_state
from services.detection.lines import DETECTOR_VERSION, detect_lines
from services.extraction.labels import extract_labelled_values
from services.preprocessing.pipeline import PreprocessOptions, preprocess_bytes
from services.recognition.session import PrintedRecognizer, current_recogniser
from services.tables.ruled import detect_ruled_tables
from services.validation.rules import validate_date, validate_gstin


def recognise_bytes(data: bytes, media_type: str, labels: list[str] | None = None, dpi: int = 200) -> RecogniseResponse:
    recogniser = current_recogniser()
    preprocessed = preprocess_bytes(data, media_type, options=PreprocessOptions(dpi=float(dpi)))
    pages: list[RecognitionPage] = []
    errors: list[PageError] = list(preprocessed.errors)
    for page in preprocessed.pages:
        if page.status != "COMPLETED" or page.output is None:
            pages.append(
                RecognitionPage(
                    page_index=page.page_index,
                    status="FAILED",
                    dpi=page.dpi,
                    provenance=page.provenance,
                    error_code=page.error_code or "PAGE_FAILED",
                )
            )
            continue
        image = _decode_png(page.output.primary_png_base64)
        lines = _recognise_page(image, page.page_index, recogniser)
        tables = _tables(image, lines)
        fields = [
            _validate_field(ExtractedValue.model_validate(field))
            for field in extract_labelled_values([line.model_dump(by_alias=True) for line in lines], labels or [])
        ]
        pages.append(
            RecognitionPage(
                page_index=page.page_index,
                status="COMPLETED",
                dpi=page.dpi,
                quality=page.quality,
                plan=page.plan,
                output=page.output,
                lines=lines,
                tables=tables,
                fields=fields,
                provenance=page.provenance,
            )
        )
    return RecogniseResponse(
        contract_version=CONTRACT_VERSION,
        input_sha256=preprocessed.input_sha256,
        media_type=media_type,
        page_count=preprocessed.page_count,
        model=ModelReport(
            model_code=recogniser.manifest.model_code,
            version=recogniser.manifest.version,
            dataset=recogniser.dataset,
            benchmark_validated=recogniser.manifest.benchmark_validated,
            synthetic_cer=recogniser.synthetic_cer,
            synthetic_wer=recogniser.synthetic_wer,
        ),
        pages=pages,
        errors=errors,
    )


def _recognise_page(image: np.ndarray, page_index: int, recogniser: PrintedRecognizer) -> list[RecognisedLine]:
    lines: list[RecognisedLine] = []
    for region_index, box in enumerate(detect_lines(image)):
        crop = image[int(box["y"]) : int(box["y"]) + int(box["height"]), int(box["x"]) : int(box["x"]) + int(box["width"])]
        if crop.size == 0:
            continue
        text, confidence = recogniser.recognise_line(crop)
        readable = bool(text.strip())
        state = assign_output_state(readable=readable, raw_confidence=confidence if readable else None, validation_passed=None)
        if not recogniser.manifest.benchmark_validated and state in {"RECOGNISED", "RECOGNISED_WITH_WARNING"}:
            state = "NEEDS_REVIEW"
        lines.append(
            RecognisedLine(
                region_index=region_index,
                page_index=page_index,
                text=text,
                confidence=None if not readable else round(confidence, 4),
                calibrated=False,
                output_state=state,  # type: ignore[arg-type]
                bbox=BoundingBox(x=int(box["x"]), y=int(box["y"]), width=int(box["width"]), height=int(box["height"])),
                model_code=recogniser.manifest.model_code,
                model_version=recogniser.manifest.version,
                benchmark_validated=recogniser.manifest.benchmark_validated,
            )
        )
    return lines


def _tables(image: np.ndarray, lines: list[RecognisedLine]) -> list[TableResult]:
    results: list[TableResult] = []
    for table in detect_ruled_tables(image):
        cells = []
        for cell in table["cells"]:  # type: ignore[index]
            bbox = cell["bbox"]
            text = _text_inside(lines, bbox)
            cells.append(
                TableCellResult(
                    row_index=int(cell["rowIndex"]),
                    col_index=int(cell["colIndex"]),
                    row_span=int(cell["rowSpan"]),
                    col_span=int(cell["colSpan"]),
                    bbox=BoundingBox.model_validate(bbox),
                    text=text,
                )
            )
        results.append(
            TableResult(
                bbox=BoundingBox.model_validate(table["bbox"]),
                row_count=int(table["rowCount"]),
                col_count=int(table["colCount"]),
                cells=cells,
                provenance=Provenance.model_validate(table["provenance"]),
            )
        )
    return results


def _text_inside(lines: list[RecognisedLine], bbox: dict[str, int]) -> str | None:
    chosen = []
    for line in lines:
        if _overlaps(line.bbox, bbox):
            chosen.append(line.text)
    text = " ".join(part for part in chosen if part).strip()
    return text or None


def _overlaps(line: BoundingBox, bbox: dict[str, int]) -> bool:
    x0 = max(line.x, int(bbox["x"]))
    y0 = max(line.y, int(bbox["y"]))
    x1 = min(line.x + line.width, int(bbox["x"]) + int(bbox["width"]))
    y1 = min(line.y + line.height, int(bbox["y"]) + int(bbox["height"]))
    return x1 > x0 and y1 > y0


def _decode_png(payload: str) -> np.ndarray:
    decoded = cv2.imdecode(np.frombuffer(base64.b64decode(payload), dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if decoded is None:
        raise UnsupportedDocument("A preprocessed page could not be decoded")
    return decoded


def _validate_field(field: ExtractedValue) -> ExtractedValue:
    if not field.value_text:
        return field
    key = field.field_key
    if "gstin" in key:
        result = validate_gstin(field.value_text)
    elif key == "date" or key.endswith("_date"):
        result = validate_date(field.value_text)
    else:
        return field
    state = field.output_state if result.passed else "VALIDATION_FAILED"
    return field.model_copy(
        update={
            "output_state": state,
            "validation_rule": result.rule_key,
            "validation_passed": result.passed,
            "validation_message": result.message,
        }
    )


def detector_version() -> str:
    return DETECTOR_VERSION
