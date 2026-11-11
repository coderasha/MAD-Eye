"""Intelligence HTTP contract v1. JSON is camelCase."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "1.0.0"


class ContractModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Provenance(ContractModel):
    component: str
    version: str
    model_code: str | None = Field(default=None, alias="modelCode")
    model_version: str | None = Field(default=None, alias="modelVersion")
    benchmark_validated: bool = Field(default=False, alias="benchmarkValidated")


class QualityReport(ContractModel):
    blur_variance: float = Field(alias="blurVariance")
    blur_level: Literal["sharp", "moderate", "blurry"] = Field(alias="blurLevel")
    noise_score: float = Field(alias="noiseScore")
    noise_level: Literal["low", "medium", "high"] = Field(alias="noiseLevel")
    skew_degrees: float = Field(alias="skewDegrees")
    contrast_std: float = Field(alias="contrastStd")
    shadow_score: float = Field(alias="shadowScore")
    width: int
    height: int
    dpi: float | None
    resolution_assessment: Literal["adequate", "low", "unknown"] = Field(alias="resolutionAssessment")
    orientation_degrees: Literal[0, 90] = Field(alias="orientationDegrees")
    orientation_confidence: float = Field(alias="orientationConfidence")
    upside_down_resolved: bool = Field(alias="upsideDownResolved")
    degradation_flags: list[str] = Field(alias="degradationFlags")


class OperationPlan(ContractModel):
    operations: list[str]
    skipped: list[str]
    reasons: dict[str, str]


class DerivativeImage(ContractModel):
    kind: Literal["binarized"]
    png_base64: str = Field(alias="pngBase64")
    sha256: str
    width: int
    height: int


class PageImageOutput(ContractModel):
    primary_png_base64: str = Field(alias="primaryPngBase64")
    primary_sha256: str = Field(alias="primarySha256")
    width: int
    height: int
    derivatives: list[DerivativeImage] = Field(default_factory=list)


class PageError(ContractModel):
    page_index: int = Field(alias="pageIndex")
    code: str
    message: str


class PageResult(ContractModel):
    page_index: int = Field(alias="pageIndex")
    status: Literal["COMPLETED", "FAILED"]
    dpi: float | None = None
    quality: QualityReport | None = None
    plan: OperationPlan | None = None
    output: PageImageOutput | None = None
    provenance: Provenance
    error_code: str | None = Field(default=None, alias="errorCode")


class PreprocessResponse(ContractModel):
    contract_version: Literal["1.0.0"] = Field(alias="contractVersion", default=CONTRACT_VERSION)
    input_sha256: str = Field(alias="inputSha256")
    media_type: str = Field(alias="mediaType")
    page_count: int = Field(alias="pageCount")
    pages: list[PageResult]
    errors: list[PageError]


class BoundingBox(ContractModel):
    x: int
    y: int
    width: int
    height: int


class RecognisedLine(ContractModel):
    region_index: int = Field(alias="regionIndex")
    page_index: int = Field(alias="pageIndex")
    text: str
    confidence: float | None
    calibrated: bool
    output_state: Literal[
        "RECOGNISED",
        "RECOGNISED_WITH_WARNING",
        "NEEDS_REVIEW",
        "UNREADABLE",
        "VALIDATION_FAILED",
    ] = Field(alias="outputState")
    bbox: BoundingBox
    model_code: str | None = Field(alias="modelCode")
    model_version: str | None = Field(alias="modelVersion")
    benchmark_validated: bool = Field(alias="benchmarkValidated")


class ExtractedValue(ContractModel):
    field_key: str = Field(alias="fieldKey")
    label: str
    value_text: str | None = Field(alias="valueText")
    confidence: float | None
    calibrated: bool
    output_state: str = Field(alias="outputState")
    region_index: int | None = Field(alias="regionIndex")
    page_index: int | None = Field(alias="pageIndex")
    validation_rule: str | None = Field(default=None, alias="validationRule")
    validation_passed: bool | None = Field(default=None, alias="validationPassed")
    validation_message: str | None = Field(default=None, alias="validationMessage")


class TableCellResult(ContractModel):
    row_index: int = Field(alias="rowIndex")
    col_index: int = Field(alias="colIndex")
    row_span: int = Field(alias="rowSpan")
    col_span: int = Field(alias="colSpan")
    bbox: BoundingBox
    text: str | None = None


class TableResult(ContractModel):
    bbox: BoundingBox
    row_count: int = Field(alias="rowCount")
    col_count: int = Field(alias="colCount")
    cells: list[TableCellResult]
    provenance: Provenance


class RecognitionPage(ContractModel):
    page_index: int = Field(alias="pageIndex")
    status: Literal["COMPLETED", "FAILED"]
    dpi: float | None = None
    quality: QualityReport | None = None
    plan: OperationPlan | None = None
    output: PageImageOutput | None = None
    lines: list[RecognisedLine] = Field(default_factory=list)
    tables: list[TableResult] = Field(default_factory=list)
    fields: list[ExtractedValue] = Field(default_factory=list)
    provenance: Provenance
    error_code: str | None = Field(default=None, alias="errorCode")


class ModelReport(ContractModel):
    model_code: str = Field(alias="modelCode")
    version: str
    dataset: str | None = None
    benchmark_validated: bool = Field(alias="benchmarkValidated")
    synthetic_cer: float | None = Field(default=None, alias="syntheticCer")
    synthetic_wer: float | None = Field(default=None, alias="syntheticWer")


class RecogniseResponse(ContractModel):
    contract_version: Literal["1.0.0"] = Field(alias="contractVersion", default=CONTRACT_VERSION)
    input_sha256: str = Field(alias="inputSha256")
    media_type: str = Field(alias="mediaType")
    page_count: int = Field(alias="pageCount")
    model: ModelReport
    pages: list[RecognitionPage]
    errors: list[PageError]


def dump_contract(model: BaseModel) -> dict:
    return model.model_dump(by_alias=True, mode="json")
