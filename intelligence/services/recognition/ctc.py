"""CTC greedy decode and line tensor preparation. No weights live here."""

from __future__ import annotations

import cv2
import numpy as np

LINE_HEIGHT = 32
LINE_WIDTH = 512


def prepare_line(image: np.ndarray, width: int = LINE_WIDTH) -> np.ndarray:
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.size == 0:
        gray = np.full((LINE_HEIGHT, 8), 255, dtype=np.uint8)
    scale = LINE_HEIGHT / max(1, gray.shape[0])
    resized_width = max(1, int(round(gray.shape[1] * scale)))
    resized = cv2.resize(gray, (resized_width, LINE_HEIGHT), interpolation=cv2.INTER_AREA)
    if resized_width > width:
        resized = cv2.resize(resized, (width, LINE_HEIGHT), interpolation=cv2.INTER_AREA)
        resized_width = width
    canvas = np.full((LINE_HEIGHT, width), 255, dtype=np.uint8)
    canvas[:, :resized_width] = resized
    tensor = canvas.astype(np.float32) / 255.0
    return tensor.reshape(1, 1, LINE_HEIGHT, width)


def greedy_decode(logits: np.ndarray) -> tuple[list[int], float]:
    """Collapse a (time, classes) logit matrix.

    The returned score is the mean of the max softmax on the kept steps.
    It is not a calibrated probability.
    """
    if logits.ndim != 2:
        raise ValueError("Expected logits shaped (time, classes)")
    shifted = logits - logits.max(axis=1, keepdims=True)
    exp = np.exp(shifted)
    probabilities = exp / exp.sum(axis=1, keepdims=True)
    path = probabilities.argmax(axis=1)
    collapsed: list[int] = []
    scores: list[float] = []
    previous = None
    for index, label in enumerate(path.tolist()):
        if label != previous and label != 0:
            collapsed.append(int(label))
            scores.append(float(probabilities[index, label]))
        previous = label
    confidence = float(np.mean(scores)) if scores else 0.0
    return collapsed, confidence


def decode_charset(indices: list[int], charset: str) -> str:
    chars: list[str] = []
    for index in indices:
        if index <= 0 or index > len(charset):
            continue
        chars.append(charset[index - 1])
    return "".join(chars)
