class MadEyeError(Exception):
    """Base error for the intelligence engine."""


class CapabilityNotImplemented(MadEyeError):
    def __init__(self, capability: str, message: str | None = None) -> None:
        self.capability = capability
        self.code = "NOT_IMPLEMENTED"
        super().__init__(
            message
            or (
                f"{capability} is not implemented. "
                "MAD-EYE will not invent a result or call an external OCR service."
            )
        )


class ModelWeightsNotRegistered(MadEyeError):
    def __init__(self, model_code: str) -> None:
        self.model_code = model_code
        self.code = "MODEL_WEIGHTS_NOT_REGISTERED"
        super().__init__(
            f"{model_code} has no registered weights. Inference was not run."
        )


class ModelIntegrityError(MadEyeError):
    def __init__(self, model_code: str) -> None:
        self.model_code = model_code
        self.code = "MODEL_INTEGRITY_FAILED"
        super().__init__(f"Checksum mismatch for {model_code}. The artefact was not loaded.")


class UnsupportedDocument(MadEyeError):
    def __init__(self, message: str) -> None:
        self.code = "UNSUPPORTED_DOCUMENT"
        super().__init__(message)
