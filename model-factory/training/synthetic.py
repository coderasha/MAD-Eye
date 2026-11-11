"""In-memory glyphs for smoke tests.

These images are drawn with the default bitmap font. They are not a dataset,
and metrics computed on them are not an accuracy claim.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


def render_line(text: str, height: int = 32) -> np.ndarray:
    width = max(32, 18 * max(1, len(text)))
    image = Image.new("L", (width, height), color=255)
    ImageDraw.Draw(image).text((2, 8), text, fill=0)
    array = np.asarray(image, dtype=np.uint8)
    return array
