"""Render an uploaded file into page images.

PDF text is not extracted. PyMuPDF is used only to rasterise pages.
"""

from __future__ import annotations

import cv2
import fitz
import numpy as np
from PIL import Image

from core.errors import UnsupportedDocument

MAX_PAGES = 100
MAX_PIXELS = 16_000_000


def render_document(data: bytes, media_type: str, dpi: int = 200) -> tuple[list[np.ndarray], float | None]:
    if media_type == "application/pdf" or data.startswith(b"%PDF"):
        return _render_pdf(data, dpi), float(dpi)
    image, embedded_dpi = _decode_image(data)
    return [image], embedded_dpi


def _render_pdf(data: bytes, dpi: int) -> list[np.ndarray]:
    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise UnsupportedDocument("The PDF could not be opened") from exc
    if document.page_count < 1:
        raise UnsupportedDocument("The PDF has no pages")
    if document.page_count > MAX_PAGES:
        raise UnsupportedDocument(f"PDF exceeds the {MAX_PAGES} page limit")
    pages: list[np.ndarray] = []
    try:
        for index in range(document.page_count):
            page = document.load_page(index)
            pixmap = page.get_pixmap(dpi=dpi, alpha=False)
            if pixmap.width * pixmap.height > MAX_PIXELS:
                raise UnsupportedDocument("A rendered page exceeds the pixel limit")
            channels = pixmap.n
            array = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, channels)
            pages.append(array.copy())
    finally:
        document.close()
    return pages


def _decode_image(data: bytes) -> tuple[np.ndarray, float | None]:
    array = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    embedded_dpi: float | None = None
    if array is None:
        try:
            with Image.open(__import__("io").BytesIO(data)) as image:
                dpi_info = image.info.get("dpi")
                if isinstance(dpi_info, tuple) and dpi_info and dpi_info[0]:
                    embedded_dpi = float(dpi_info[0])
                converted = image.convert("RGB")
                array = cv2.cvtColor(np.array(converted), cv2.COLOR_RGB2BGR)
        except Exception as exc:  # noqa: BLE001
            raise UnsupportedDocument("The image could not be decoded") from exc
    else:
        try:
            with Image.open(__import__("io").BytesIO(data)) as image:
                dpi_info = image.info.get("dpi")
                if isinstance(dpi_info, tuple) and dpi_info and dpi_info[0]:
                    embedded_dpi = float(dpi_info[0])
        except Exception:
            embedded_dpi = None
    if array.size == 0:
        raise UnsupportedDocument("The image is empty")
    if array.shape[0] * array.shape[1] > MAX_PIXELS:
        raise UnsupportedDocument("The image exceeds the pixel limit")
    return array, embedded_dpi
