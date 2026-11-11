from core.errors import CapabilityNotImplemented, ModelIntegrityError, ModelWeightsNotRegistered
from runtime.onnx_runtime import ModelManifest, load_session
from services.classification import classify_document
from services.confidence.states import assign_output_state, calibrate, resolve_disagreement
from services.validation.rules import gstin_check_character, validate_date, validate_gstin


def test_gstin_roundtrip_and_rejection() -> None:
    body = "22AAAAA0000A1Z"
    token = body + gstin_check_character(body)
    assert validate_gstin(token).passed
    broken = token[:-1] + ("A" if token[-1] != "A" else "B")
    assert not validate_gstin(broken).passed


def test_dates() -> None:
    assert validate_date("2026-11-11").passed
    assert validate_date("11/11/2026").passed
    assert not validate_date("11/31/2026").passed


def test_output_states_and_disagreement() -> None:
    assert assign_output_state(readable=False, raw_confidence=0.99, validation_passed=True) == "UNREADABLE"
    assert (
        assign_output_state(readable=True, raw_confidence=0.99, validation_passed=False) == "VALIDATION_FAILED"
    )
    assert assign_output_state(readable=True, raw_confidence=0.2, validation_passed=True) == "NEEDS_REVIEW"
    assert (
        assign_output_state(readable=True, raw_confidence=0.7, validation_passed=True)
        == "RECOGNISED_WITH_WARNING"
    )
    assert assign_output_state(readable=True, raw_confidence=0.95, validation_passed=None) == "RECOGNISED"
    assert resolve_disagreement(["a", "a"]) == "AGREED"
    assert resolve_disagreement(["a", "b"]) == "NEEDS_REVIEW"
    score, calibrated = calibrate(0.4, None)
    assert score == 0.4
    assert calibrated is False


def test_unimplemented_modules_raise() -> None:
    try:
        classify_document()
    except CapabilityNotImplemented as exc:
        assert exc.code == "NOT_IMPLEMENTED"
    else:
        raise AssertionError("classification should not run")


def test_onnx_gate(tmp_path) -> None:
    manifest = ModelManifest.model_validate(
        {"modelCode": "me-04-printed-recognition", "version": "0", "status": "architecture_defined"}
    )
    try:
        load_session(manifest, tmp_path)
    except ModelWeightsNotRegistered:
        pass
    else:
        raise AssertionError("missing weights should not load")
    weight = tmp_path / "model.onnx"
    weight.write_bytes(b"not-a-real-model")
    bad = ModelManifest.model_validate(
        {
            "modelCode": "me-04-printed-recognition",
            "version": "0",
            "status": "registered",
            "weightsPath": "model.onnx",
            "weightsSha256": "0" * 64,
        }
    )
    try:
        load_session(bad, tmp_path)
    except ModelIntegrityError:
        pass
    else:
        raise AssertionError("bad checksum should not load")
