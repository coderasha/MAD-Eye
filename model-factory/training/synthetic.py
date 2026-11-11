"""In-memory glyphs for smoke tests.

These images are drawn with the default bitmap font. They are not a dataset,
and metrics computed on them are not an accuracy claim.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


def render_line(text: str, height: int = 32) -> np.ndarray:
    """Draw text and scale the ink so it fills the recogniser line height.

    The returned image is the tight line, not a wide white canvas. Padding to
    a fixed width leaves the blank class as the easiest CTC output.
    """
    provisional = max(24, 14 * max(1, len(text)))
    image = Image.new("L", (provisional, height), color=255)
    ImageDraw.Draw(image).text((1, 4), text, fill=0)
    array = np.asarray(image, dtype=np.uint8)
    ink = np.argwhere(array < 200)
    if ink.size == 0:
        return np.full((height, height), 255, dtype=np.uint8)
    y0, x0 = ink.min(axis=0)
    y1, x1 = ink.max(axis=0) + 1
    crop = array[y0:y1, x0:x1]
    scale = height / max(1, crop.shape[0])
    width = max(8, int(round(crop.shape[1] * scale)))
    resized = Image.fromarray(crop).resize((width, height), Image.Resampling.BILINEAR)
    return np.asarray(resized, dtype=np.uint8)
