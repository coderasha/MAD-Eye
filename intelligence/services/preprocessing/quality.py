"""Deterministic image measurements.

Thresholds classify measurements for routing. They are not probabilities of
correctness and they have not been calibrated on a held-out set.
"""

from __future__ import annotations

import cv2
import numpy as np

BLUR_MODERATE = 80.0
BLUR_SHARP = 300.0
NOISE_MEDIUM = 3.0
NOISE_HIGH = 8.0
CONTRAST_LOW = 35.0
INK_SEPARATION_LOW = 40.0
SHADOW_HIGH = 18.0
SKEW_ACT_DEGREES = 0.75
MIN_DIMENSION_ADEQUATE = 800
MIN_DPI_ADEQUATE = 150.0


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        gray = image
    elif image.shape[2] == 4:
        gray = cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    else:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.dtype != np.uint8:
        gray = np.clip(gray, 0, 255).astype(np.uint8)
    return gray


def blur_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def blur_level(variance: float) -> str:
    if variance >= BLUR_SHARP:
        return "sharp"
    if variance >= BLUR_MODERATE:
        return "moderate"
    return "blurry"


def noise_score(gray: np.ndarray) -> float:
    residual = cv2.absdiff(gray, cv2.medianBlur(gray, 3))
    return float(np.mean(residual))


def noise_level(score: float) -> str:
    if score >= NOISE_HIGH:
        return "high"
    if score >= NOISE_MEDIUM:
        return "medium"
    return "low"


def contrast_std(gray: np.ndarray) -> float:
    return float(gray.std())


def ink_separation(gray: np.ndarray) -> float:
    """Gap between the paper and the darkest ink.

    Global standard deviation is small on a mostly white page even when the
    strokes are black. That gap is what decides whether contrast enhancement
    is useful.
    """
    flat = gray.astype(np.float32).ravel()
    if flat.size == 0:
        return 0.0
    paper = float(np.percentile(flat, 90))
    count = max(1, int(flat.size * 0.002))
    darkest = float(np.partition(flat, count - 1)[:count].mean())
    return paper - darkest


def shadow_score(gray: np.ndarray) -> float:
    side = min(gray.shape[:2])
    kernel_size = max(15, (side // 8) | 1)
    kernel_size = min(kernel_size, side if side % 2 == 1 else side - 1)
    if kernel_size < 3:
        return 0.0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    background = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel)
    return float(background.std())


def _foreground(gray: np.ndarray) -> np.ndarray:
    if float(gray.std()) < 1.0:
        return np.zeros_like(gray)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return binary


def _projection_score(binary: np.ndarray, angle: float) -> float:
    if abs(angle) < 1e-6:
        rotated = binary
    else:
        height, width = binary.shape[:2]
        matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
        rotated = cv2.warpAffine(
            binary,
            matrix,
            (width, height),
            flags=cv2.INTER_NEAREST,
            borderValue=0,
        )
    projection = rotated.sum(axis=1).astype(np.float64)
    return float(projection.var())


def estimate_skew_degrees(gray: np.ndarray, max_angle: float = 12.0) -> float:
    """Return the content skew in degrees.

    Rotating the image by the negative of this value is the deskew correction.
    A weak peak relative to zero degrees is reported as 0 so flat noise does
    not trigger a rotation.
    """
    sample = gray
    height, width = gray.shape[:2]
    longest = max(height, width)
    if longest > 640:
        scale = 640.0 / longest
        sample = cv2.resize(gray, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    binary = _foreground(sample)
    if float(binary.mean()) < 1.0:
        return 0.0
    angles = np.arange(-max_angle, max_angle + 1e-6, 0.5)
    scores = [_projection_score(binary, float(angle)) for angle in angles]
    best_index = int(np.argmax(scores))
    best_angle = float(angles[best_index])
    refine_from = max(-max_angle, best_angle - 0.5)
    refine_to = min(max_angle, best_angle + 0.5)
    fine = np.arange(refine_from, refine_to + 1e-6, 0.1)
    fine_scores = [_projection_score(binary, float(angle)) for angle in fine]
    correction = float(fine[int(np.argmax(fine_scores))])
    zero_score = _projection_score(binary, 0.0)
    best_score = max(fine_scores)
    if best_score < zero_score * 1.05:
        return 0.0
    # The searched angle is the correction that maximises horizontal alignment.
    return round(-correction, 2)


def orientation_degrees(gray: np.ndarray) -> tuple[int, float]:
    """Distinguish horizontal structure (0) from vertical structure (90).

    This does not resolve 180 degrees. Confidence is the relative gap between
    the two projection variances, clipped to [0, 1]. It is not a calibrated
    probability.
    """
    binary = _foreground(gray)
    if float(binary.mean()) < 1.0:
        return 0, 0.0
    horizontal = float(binary.sum(axis=1).astype(np.float64).var())
    vertical = float(binary.sum(axis=0).astype(np.float64).var())
    if horizontal <= 0 and vertical <= 0:
        return 0, 0.0
    if vertical > horizontal * 1.25:
        confidence = (vertical - horizontal) / max(vertical, 1.0)
        return 90, float(min(1.0, max(0.0, confidence)))
    confidence = (horizontal - vertical) / max(horizontal, 1.0)
    return 0, float(min(1.0, max(0.0, confidence)))


def resolution_assessment(width: int, height: int, dpi: float | None) -> str:
    if dpi is not None and dpi < MIN_DPI_ADEQUATE:
        return "low"
    if min(width, height) < MIN_DIMENSION_ADEQUATE and dpi is None:
        return "unknown"
    if min(width, height) < MIN_DIMENSION_ADEQUATE:
        return "low"
    if dpi is None:
        return "unknown"
    return "adequate"
