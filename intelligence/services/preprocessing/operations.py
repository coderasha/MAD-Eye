"""Classical image operations. None of these synthesise text."""

from __future__ import annotations

import cv2
import numpy as np


def rotate_image(image: np.ndarray, angle_ccw: float) -> np.ndarray:
    if abs(angle_ccw) < 1e-3:
        return image.copy()
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle_ccw, 1.0)
    return cv2.warpAffine(
        image,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def correct_illumination(gray: np.ndarray) -> np.ndarray:
    side = min(gray.shape[:2])
    kernel_size = max(15, (side // 8) | 1)
    kernel_size = min(kernel_size, side if side % 2 == 1 else side - 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    background = cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel)
    background = np.maximum(background, 1)
    corrected = cv2.divide(gray, background, scale=255)
    return corrected


def denoise(gray: np.ndarray, level: str) -> np.ndarray:
    pixels = int(gray.shape[0] * gray.shape[1])
    if level == "high" and pixels <= 2_000_000:
        return cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    return cv2.medianBlur(gray, 3)


def enhance_contrast(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def unsharp_mask(gray: np.ndarray) -> np.ndarray:
    """Classical unsharp mask. Off by default: it increases edge contrast and can halo."""
    blurred = cv2.GaussianBlur(gray, (0, 0), sigmaX=1.2)
    return cv2.addWeighted(gray, 1.5, blurred, -0.5, 0)


def binarize(gray: np.ndarray) -> np.ndarray:
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        10,
    )


def limit_long_side(gray: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
    height, width = gray.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return gray, 1.0
    scale = max_side / float(longest)
    resized = cv2.resize(
        gray,
        (max(1, int(round(width * scale))), max(1, int(round(height * scale)))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


def encode_png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return encoded.tobytes()
