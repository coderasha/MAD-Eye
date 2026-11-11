"""Label-value extraction from already recognised lines.

A missing label is omitted. The label string is never stored as the value.
"""

from __future__ import annotations


def extract_labelled_values(lines: list[dict[str, object]], labels: list[str]) -> list[dict[str, object]]:
    fields: list[dict[str, object]] = []
    for label in labels:
        needle = label.casefold().strip()
        if not needle:
            continue
        match = _find(lines, needle, label)
        if match is None:
            continue
        fields.append(match)
    return fields


def _find(lines: list[dict[str, object]], needle: str, label: str) -> dict[str, object] | None:
    for line in lines:
        text = str(line.get("text") or "")
        index = text.casefold().find(needle)
        if index < 0:
            continue
        remainder = text[index + len(needle) :].strip(" \t:.-")
        confidence = line.get("confidence")
        if remainder:
            return {
                "fieldKey": _key(label),
                "label": label,
                "valueText": remainder,
                "confidence": confidence,
                "calibrated": False,
                "outputState": line.get("outputState") or "NEEDS_REVIEW",
                "regionIndex": line.get("regionIndex"),
                "pageIndex": line.get("pageIndex"),
            }
        return {
            "fieldKey": _key(label),
            "label": label,
            "valueText": None,
            "confidence": confidence,
            "calibrated": False,
            "outputState": "NEEDS_REVIEW",
            "regionIndex": line.get("regionIndex"),
            "pageIndex": line.get("pageIndex"),
        }
    return None


def _key(label: str) -> str:
    chars = [char.lower() if char.isalnum() else "_" for char in label.strip()]
    return "".join(chars).strip("_") or "field"
