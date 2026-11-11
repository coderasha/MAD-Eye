"""Script identification is not implemented."""

from core.errors import CapabilityNotImplemented


def identify_script(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("me-02-script-intelligence")
