"""Text detection is not implemented."""

from core.errors import CapabilityNotImplemented


def detect_text(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("me-03-text-detection")
