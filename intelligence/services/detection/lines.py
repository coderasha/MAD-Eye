"""Classical text-line detection.

This is a contour grouping algorithm, not a trained DBNet and not a benchmarked
detector. Boxes are pixel measurements of ink groups.
"""

from __future__ import annotations

import cv2
import numpy as np

DETECTOR_VERSION = "0.1.0-classical"


def detect_lines(image: np.ndarray) -> list[dict[str, int | float]]:
    gray = _gray(image)
    height, width = gray.shape[:2]
    if height < 8 or width < 8:
        return []
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    kernel_width = max(8, width // 100)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 2))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    contours, _hierarchy = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[dict[str, int | float]] = []
    for contour in contours:
        x, y, box_width, box_height = cv2.boundingRect(contour)
        if box_height < 8 or box_width < 8:
            continue
        if box_height > height * 0.6 and box_width > width * 0.85:
            continue
        ink = float(binary[y : y + box_height, x : x + box_width].mean()) / 255.0
        if ink < 0.03:
            continue
        x0 = max(0, x - min(4, x))
        y0 = max(0, y - min(2, y))
        x1 = min(width, x + box_width + 4)
        y1 = min(height, y + box_height + 2)
        boxes.append(
            {
                "x": int(x0),
                "y": int(y0),
                "width": int(x1 - x0),
                "height": int(y1 - y0),
                "ink": round(ink, 4),
            }
        )
    boxes.sort(key=lambda box: (int(box["y"]) // max(8, int(box["height"])), int(box["x"])))
    return boxes


def _gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
