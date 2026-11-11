"""ME-04 inference boundary."""

from core.errors import ModelWeightsNotRegistered


def recognise(*_args: object, **_kwargs: object) -> None:
    raise ModelWeightsNotRegistered("me-04-printed-recognition")
