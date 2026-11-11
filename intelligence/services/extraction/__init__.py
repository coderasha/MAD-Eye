"""Field extraction is not implemented."""

from core.errors import CapabilityNotImplemented


def extract_fields(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("field-extraction")
