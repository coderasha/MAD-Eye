"""Layout analysis is not implemented."""

from core.errors import CapabilityNotImplemented


def analyse_layout(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("me-06-layout")
