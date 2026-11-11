"""Printed English charset for ME-04.

Hindi and Odia charsets are intentionally absent until a dataset manifest
defines them. An empty vocabulary must not be described as language support.
"""

ENGLISH_CHARSET = (
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " .,;:'\"!?&()-/@#%+"
)


def charset_size(charset: str) -> int:
    """Classes including the CTC blank at index 0."""
    if len(set(charset)) != len(charset):
        raise ValueError("Charset contains a repeated character")
    return len(charset) + 1


def encode_text(text: str, charset: str) -> list[int]:
    index = {char: position + 1 for position, char in enumerate(charset)}
    try:
        return [index[char] for char in text]
    except KeyError as exc:
        raise ValueError(f"Character {exc.args[0]!r} is outside the charset") from exc


def decode_indices(indices: list[int], charset: str) -> str:
    chars = []
    for index in indices:
        if index <= 0:
            continue
        if index > len(charset):
            raise ValueError(f"Index {index} is outside the charset")
        chars.append(charset[index - 1])
    return "".join(chars)
