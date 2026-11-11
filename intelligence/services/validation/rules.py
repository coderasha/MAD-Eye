"""Checksums and date shapes used later by field validation.

A passing check means the string matches a rule. It does not mean a document
was read correctly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


@dataclass(frozen=True)
class RuleResult:
    rule_key: str
    passed: bool
    message: str


def gstin_check_character(body: str) -> str:
    if len(body) != 14:
        raise ValueError("GSTIN body must be 14 characters")
    factor = 2
    total = 0
    for char in reversed(body):
        code = GSTIN_CHARSET.index(char)
        product = code * factor
        total += product // 36 + product % 36
        factor = 1 if factor == 2 else 2
    digit = (36 - (total % 36)) % 36
    return GSTIN_CHARSET[digit]


def validate_gstin(value: str) -> RuleResult:
    normalised = value.strip().upper()
    if not GSTIN_PATTERN.match(normalised):
        return RuleResult("gstin.format", False, "GSTIN shape is invalid")
    expected = gstin_check_character(normalised[:14])
    if normalised[-1] != expected:
        return RuleResult("gstin.checksum", False, "GSTIN checksum does not match")
    return RuleResult("gstin.checksum", True, "GSTIN checksum matches")


def validate_date(value: str) -> RuleResult:
    text = value.strip()
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            datetime.strptime(text, pattern)
            return RuleResult("date.format", True, "Date matches an accepted calendar format")
        except ValueError:
            continue
    return RuleResult("date.format", False, "Date is not YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY")


def validate_non_empty(value: str | None) -> RuleResult:
    if value is not None and value.strip():
        return RuleResult("text.non_empty", True, "Value is non-empty")
    return RuleResult("text.non_empty", False, "Value is empty")
