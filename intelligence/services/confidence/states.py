"""Map raw scores to explicit output states.

Raw network scores are not treated as calibrated probabilities. Calibration
requires a held-out table that this function does not invent.
"""

from __future__ import annotations

OUTPUT_STATES = (
    "RECOGNISED",
    "RECOGNISED_WITH_WARNING",
    "NEEDS_REVIEW",
    "UNREADABLE",
    "VALIDATION_FAILED",
)


def calibrate(raw_score: float, table: list[tuple[float, float]] | None) -> tuple[float, bool]:
    if table is None:
        return raw_score, False
    if not table:
        return raw_score, False
    chosen = table[0][1]
    for upper, probability in table:
        chosen = probability
        if raw_score <= upper:
            break
    return chosen, True


def assign_output_state(
    *,
    readable: bool,
    raw_confidence: float | None,
    validation_passed: bool | None,
    review_threshold: float = 0.5,
    warning_threshold: float = 0.85,
    calibrated: bool = False,
) -> str:
    """Choose a state.

    `calibrated` does not change the state machine. It is accepted so callers
    record whether the threshold comparison used a calibration map. Thresholds
    on uncalibrated scores are operational gates, not accuracy claims.
    """
    del calibrated
    if not readable or raw_confidence is None:
        return "UNREADABLE"
    if validation_passed is False:
        return "VALIDATION_FAILED"
    if raw_confidence < review_threshold:
        return "NEEDS_REVIEW"
    if raw_confidence < warning_threshold:
        return "RECOGNISED_WITH_WARNING"
    return "RECOGNISED"


def resolve_disagreement(hypotheses: list[str]) -> str:
    """Independent hypotheses that differ are sent to review.

    The most common string is not selected.
    """
    if not hypotheses:
        return "NEEDS_REVIEW"
    unique = set(hypotheses)
    if len(unique) == 1:
        return "AGREED"
    return "NEEDS_REVIEW"
