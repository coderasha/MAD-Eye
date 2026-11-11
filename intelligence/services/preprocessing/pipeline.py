"""Adaptive preprocessing.

The original array is not mutated. Callers that own the source file keep it.
This module returns a derivative and a record of which operations ran.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np

from core.contracts import (
    CONTRACT_VERSION,
    DerivativeImage,
    OperationPlan,
    PageError,
    PageImageOutput,
    PageResult,
    PreprocessResponse,
    Provenance,
    QualityReport,
    dump_contract,
)
from services.preprocessing import operations, quality

PREPROCESS_VERSION = "0.1.0"
PROVENANCE = Provenance(
    component="preprocessing",
    version=PREPROCESS_VERSION,
    model_code=None,
    model_version=None,
    benchmark_validated=False,
)


@dataclass(frozen=True)
class PreprocessOptions:
    include_binarized: bool = False
    allow_experimental_deblur: bool = False
    max_long_side: int = 4000
    dpi: float | None = None


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def assess(gray: np.ndarray, dpi: float | None) -> QualityReport:
    variance = quality.blur_variance(gray)
    noise = quality.noise_score(gray)
    contrast = quality.contrast_std(gray)
    shadow = quality.shadow_score(gray)
    skew = quality.estimate_skew_degrees(gray)
    orientation, orientation_confidence = quality.orientation_degrees(gray)
    height, width = gray.shape[:2]
    flags: list[str] = []
    level = quality.blur_level(variance)
    nlevel = quality.noise_level(noise)
    if level == "blurry":
        flags.append("blur")
    if nlevel == "high":
        flags.append("noise")
    if contrast < quality.CONTRAST_LOW:
        flags.append("low_contrast")
    if shadow >= quality.SHADOW_HIGH:
        flags.append("shadow")
    if abs(skew) >= quality.SKEW_ACT_DEGREES:
        flags.append("skew")
    resolution = quality.resolution_assessment(width, height, dpi)
    if resolution == "low":
        flags.append("low_resolution")
    if orientation == 90:
        flags.append("sideways")
    return QualityReport(
        blur_variance=round(variance, 4),
        blur_level=level,  # type: ignore[arg-type]
        noise_score=round(noise, 4),
        noise_level=nlevel,  # type: ignore[arg-type]
        skew_degrees=skew,
        contrast_std=round(contrast, 4),
        shadow_score=round(shadow, 4),
        width=int(width),
        height=int(height),
        dpi=dpi,
        resolution_assessment=resolution,  # type: ignore[arg-type]
        orientation_degrees=orientation,  # type: ignore[arg-type]
        orientation_confidence=round(orientation_confidence, 4),
        upside_down_resolved=False,
        degradation_flags=flags,
    )


def build_plan(report: QualityReport, options: PreprocessOptions, scale: float) -> OperationPlan:
    operations_run: list[str] = ["grayscale"]
    skipped: list[str] = []
    reasons: dict[str, str] = {}
    if scale < 1.0:
        operations_run.append("resize")
        reasons["resize"] = "longest side exceeded the configured maximum"
    else:
        skipped.append("resize")
        reasons["resize"] = "within the size limit"
    if abs(report.skew_degrees) >= quality.SKEW_ACT_DEGREES:
        operations_run.append("deskew")
        reasons["deskew"] = f"estimated skew {report.skew_degrees} degrees"
    else:
        skipped.append("deskew")
        reasons["deskew"] = "skew below the action threshold"
    if report.shadow_score >= quality.SHADOW_HIGH:
        operations_run.append("illumination_correction")
        reasons["illumination_correction"] = "background illumination is uneven"
    else:
        skipped.append("illumination_correction")
        reasons["illumination_correction"] = "background is even enough"
    if report.noise_level in {"medium", "high"}:
        operations_run.append("denoise")
        reasons["denoise"] = f"noise level {report.noise_level}"
    else:
        skipped.append("denoise")
        reasons["denoise"] = "noise below the action threshold"
    if report.contrast_std < quality.CONTRAST_LOW:
        operations_run.append("contrast")
        reasons["contrast"] = "global contrast is low"
    else:
        skipped.append("contrast")
        reasons["contrast"] = "contrast is adequate"
    if options.allow_experimental_deblur and report.blur_level == "blurry":
        operations_run.append("experimental_unsharp")
        reasons["experimental_unsharp"] = "explicitly requested; classical unsharp mask, not a generative restoration"
    else:
        skipped.append("experimental_unsharp")
        reasons["experimental_unsharp"] = "disabled unless allowExperimentalDeblur is set"
    if report.orientation_degrees == 90:
        skipped.append("orientation_rotation")
        reasons["orientation_rotation"] = (
            "sideways structure was detected; direction is ambiguous without recognition, so no rotation was applied"
        )
    else:
        skipped.append("orientation_rotation")
        reasons["orientation_rotation"] = "no sideways structure detected; 180 degrees is not resolved"
    if options.include_binarized:
        operations_run.append("binarize_derivative")
        reasons["binarize_derivative"] = "requested as a separate derivative; the primary image stays grayscale"
    else:
        skipped.append("binarize_derivative")
        reasons["binarize_derivative"] = "not requested"
    return OperationPlan(operations=operations_run, skipped=skipped, reasons=reasons)


def apply_plan(gray: np.ndarray, plan: OperationPlan, skew_degrees: float) -> tuple[np.ndarray, np.ndarray | None]:
    working = gray.copy()
    if "deskew" in plan.operations:
        working = operations.rotate_image(working, -skew_degrees)
    if "illumination_correction" in plan.operations:
        working = operations.correct_illumination(working)
    if "denoise" in plan.operations:
        level = "high" if "noise level high" in plan.reasons.get("denoise", "") else "medium"
        working = operations.denoise(working, level)
    if "contrast" in plan.operations:
        working = operations.enhance_contrast(working)
    if "experimental_unsharp" in plan.operations:
        working = operations.unsharp_mask(working)
    derivative = operations.binarize(working) if "binarize_derivative" in plan.operations else None
    return working, derivative


def process_page(image: np.ndarray, options: PreprocessOptions, page_index: int = 0) -> PageResult:
    if image.size == 0:
        raise ValueError("empty page")
    gray = quality.to_gray(image)
    limited, scale = operations.limit_long_side(gray, options.max_long_side)
    report = assess(limited, options.dpi)
    plan = build_plan(report, options, scale)
    primary, binary = apply_plan(limited, plan, report.skew_degrees)
    encoded = operations.encode_png(primary)
    derivatives = []
    if binary is not None:
        binary_bytes = operations.encode_png(binary)
        derivatives.append(
            DerivativeImage(
                kind="binarized",
                png_base64=_b64(binary_bytes),
                sha256=_sha256(binary_bytes),
                width=int(binary.shape[1]),
                height=int(binary.shape[0]),
            )
        )
    return PageResult(
        page_index=page_index,
        status="COMPLETED",
        dpi=options.dpi,
        quality=report,
        plan=plan,
        output=PageImageOutput(
            primary_png_base64=_b64(encoded),
            primary_sha256=_sha256(encoded),
            width=int(primary.shape[1]),
            height=int(primary.shape[0]),
            derivatives=derivatives,
        ),
        provenance=PROVENANCE,
    )


def process_pages(images: list[np.ndarray], options: PreprocessOptions) -> tuple[list[PageResult], list[PageError]]:
    pages: list[PageResult] = []
    errors: list[PageError] = []
    for index, image in enumerate(images):
        try:
            pages.append(process_page(image, options, page_index=index))
        except Exception as exc:  # noqa: BLE001 — one page must not abort the document
            message = exc.__class__.__name__
            errors.append(PageError(page_index=index, code="PAGE_FAILED", message=message))
            pages.append(
                PageResult(
                    page_index=index,
                    status="FAILED",
                    dpi=options.dpi,
                    provenance=PROVENANCE,
                    error_code="PAGE_FAILED",
                )
            )
    return pages, errors


def preprocess_bytes(
    data: bytes,
    media_type: str,
    *,
    options: PreprocessOptions | None = None,
) -> PreprocessResponse:
    from services.ingestion.render import render_document

    selected = options or PreprocessOptions()
    pages_np, resolved_dpi = render_document(data, media_type, dpi=int(selected.dpi or 200))
    page_options = PreprocessOptions(
        include_binarized=selected.include_binarized,
        allow_experimental_deblur=selected.allow_experimental_deblur,
        max_long_side=selected.max_long_side,
        dpi=resolved_dpi if selected.dpi is None else selected.dpi,
    )
    pages, errors = process_pages(pages_np, page_options)
    return PreprocessResponse(
        contract_version=CONTRACT_VERSION,
        input_sha256=_sha256(data),
        media_type=media_type,
        page_count=len(pages_np),
        pages=pages,
        errors=errors,
    )


def response_dict(response: PreprocessResponse) -> dict:
    return dump_contract(response)


def _b64(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")
