"""Ruled-table geometry.

A table is reported only when both horizontal and vertical ruling lines are
measured. An unruled page produces no table. Merged cells are not inferred.
"""

from __future__ import annotations

import cv2
import numpy as np


def detect_ruled_tables(image: np.ndarray) -> list[dict[str, object]]:
    gray = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape[:2]
    if height < 40 or width < 40:
        return []
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 8)
    horizontal = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, width // 12), 1)),
    )
    vertical = cv2.morphologyEx(
        binary,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, height // 12))),
    )
    row_edges = _peaks(horizontal.sum(axis=1), minimum=width * 8)
    col_edges = _peaks(vertical.sum(axis=0), minimum=height * 8)
    if len(row_edges) < 2 or len(col_edges) < 2:
        return []
    rows = _spans(row_edges)
    cols = _spans(col_edges)
    if not rows or not cols:
        return []
    cells = []
    for row_index, (y0, y1) in enumerate(rows):
        for col_index, (x0, x1) in enumerate(cols):
            cells.append(
                {
                    "rowIndex": row_index,
                    "colIndex": col_index,
                    "rowSpan": 1,
                    "colSpan": 1,
                    "bbox": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
                }
            )
    return [
        {
            "bbox": {
                "x": cols[0][0],
                "y": rows[0][0],
                "width": cols[-1][1] - cols[0][0],
                "height": rows[-1][1] - rows[0][0],
            },
            "rowCount": len(rows),
            "colCount": len(cols),
            "cells": cells,
            "provenance": {
                "component": "ruled-table-geometry",
                "version": "0.1.0",
                "modelCode": None,
                "modelVersion": None,
                "benchmarkValidated": False,
            },
        }
    ]


def _peaks(profile: np.ndarray, minimum: float) -> list[int]:
    active = profile >= minimum
    edges: list[int] = []
    start = None
    for index, flag in enumerate(active.tolist()):
        if flag and start is None:
            start = index
        elif not flag and start is not None:
            edges.append((start + index) // 2)
            start = None
    if start is not None:
        edges.append((start + len(active) - 1) // 2)
    return edges


def _spans(edges: list[int]) -> list[tuple[int, int]]:
    spans = []
    for left, right in zip(edges, edges[1:], strict=False):
        if right - left >= 8:
            spans.append((left, right))
    return spans
