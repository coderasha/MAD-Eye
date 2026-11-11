"""Character and word error rate.

Grapheme mode uses Unicode extended grapheme clusters so a Devanagari base
plus matra can be counted as one unit. Code-point mode is the default for
English.
"""

from __future__ import annotations

import unicodedata

import regex


def grapheme_clusters(text: str) -> list[str]:
    return regex.findall(r"\X", unicodedata.normalize("NFC", text))


def _tokens(text: str, mode: str) -> list[str]:
    if mode == "grapheme":
        return grapheme_clusters(text)
    if mode == "codepoint":
        return list(text)
    raise ValueError(f"Unknown mode {mode}")


def levenshtein(left: list[str], right: list[str]) -> int:
    if not left:
        return len(right)
    if not right:
        return len(left)
    previous = list(range(len(right) + 1))
    for i, left_token in enumerate(left, start=1):
        current = [i]
        for j, right_token in enumerate(right, start=1):
            cost = 0 if left_token == right_token else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def cer(reference: str, hypothesis: str, mode: str = "codepoint") -> float:
    ref = _tokens(reference, mode)
    hyp = _tokens(hypothesis, mode)
    if not ref:
        return 0.0 if not hyp else 1.0
    return levenshtein(ref, hyp) / len(ref)


def wer(reference: str, hypothesis: str) -> float:
    ref = reference.split()
    hyp = hypothesis.split()
    if not ref:
        return 0.0 if not hyp else 1.0
    return levenshtein(ref, hyp) / len(ref)


def build_report(pairs: list[tuple[str, str]], mode: str = "codepoint") -> dict[str, object]:
    """Aggregate measured rates.

    `benchmarkValidated` is always false. A perfect score on the pairs handed
    to this function is still only a measurement of those pairs.
    """
    if not pairs:
        raise ValueError("At least one pair is required")
    char_rates = [cer(reference, hypothesis, mode) for reference, hypothesis in pairs]
    word_rates = [wer(reference, hypothesis) for reference, hypothesis in pairs]
    return {
        "measured": True,
        "benchmarkValidated": False,
        "reason": "This harness records measurements only. It cannot mark a held-out benchmark.",
        "mode": mode,
        "sampleCount": len(pairs),
        "cer": sum(char_rates) / len(char_rates),
        "wer": sum(word_rates) / len(word_rates),
    }
