"""Table recognition is not implemented."""

from core.errors import CapabilityNotImplemented


def recognise_table(*_args: object, **_kwargs: object) -> None:
    raise CapabilityNotImplemented("me-07-tables")
