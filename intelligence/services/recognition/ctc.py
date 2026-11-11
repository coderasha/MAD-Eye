"""CTC greedy decode and line tensor preparation. No weights live here."""

from __future__ import annotations

import cv2
import numpy as np

LINE_HEIGHT = 32
MAX_LINE_WIDTH = 1024


def prepare_line(image: np.ndarray, width: int | None = None) -> np.ndarray:
    """Scale a line crop to the training height and keep its own width.

    Width is rounded up to a multiple of 4, which is the network's width
    downsampling. A fixed wide canvas is not added.
    """
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if gray.size == 0:
        gray = np.full((LINE_HEIGHT, 8), 255, dtype=np.uint8)
    gray = _crop_to_ink(gray)
    scale = LINE_HEIGHT / max(1, gray.shape[0])
    resized_width = max(1, int(round(gray.shape[1] * scale)))
    resized = cv2.resize(gray, (resized_width, LINE_HEIGHT), interpolation=cv2.INTER_AREA)
    limit = width if width is not None else min(MAX_LINE_WIDTH, max(8, resized_width))
    limit += (4 - limit % 4) % 4
    if resized_width > limit:
        resized = cv2.resize(resized, (limit, LINE_HEIGHT), interpolation=cv2.INTER_AREA)
        resized_width = limit
    canvas = np.full((LINE_HEIGHT, limit), 255, dtype=np.uint8)
    canvas[:, :resized_width] = resized
    tensor = canvas.astype(np.float32) / 255.0
    return tensor.reshape(1, 1, LINE_HEIGHT, limit)


def _crop_to_ink(gray: np.ndarray) -> np.ndarray:
    """Drop the paper around a line so the strokes fill the network height.

    Training glyphs are scaled from their ink bounds. A detector box with a
    margin would otherwise shrink those strokes.
    """
    if float(gray.std()) < 1.0:
        return gray
    _threshold, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = np.argwhere(binary > 0)
    if ink.size == 0:
        return gray
    y0, x0 = ink.min(axis=0)
    y1, x1 = ink.max(axis=0) + 1
    return gray[int(y0) : int(y1), int(x0) : int(x1)]


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
