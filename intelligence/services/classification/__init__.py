"""Document classification is not implemented."""

from core.errors import CapabilityNotImplemented


def classify_document(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("me-08-classification")
