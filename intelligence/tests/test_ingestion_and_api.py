import fitz
from fastapi.testclient import TestClient

from services.gateway.app import create_app
from services.preprocessing.pipeline import PreprocessOptions, preprocess_bytes


def _pdf_bytes() -> bytes:
    document = fitz.open()
    page = document.new_page(width=320, height=200)
    page.insert_text((72, 72), "MAD-EYE")
    payload = document.tobytes()
    document.close()
    return payload


def test_pdf_rasterises_without_returning_text() -> None:
    result = preprocess_bytes(_pdf_bytes(), "application/pdf", options=PreprocessOptions(dpi=120))
    assert result.page_count == 1
    assert result.pages[0].status == "COMPLETED"
    assert result.pages[0].output is not None
    import base64

    png = base64.b64decode(result.pages[0].output.primary_png_base64)
    assert png.startswith(b"\x89PNG")
    serialised = result.model_dump(by_alias=True)
    assert "MAD-EYE" not in str(serialised["pages"][0]["plan"])


def test_recognise_without_weights_returns_501(monkeypatch) -> None:
    monkeypatch.delenv("MADEYE_ME04_MANIFEST", raising=False)
    client = TestClient(create_app())
    response = client.post("/v1/recognise", files={"file": ("page.png", _png(), "image/png")})
    assert response.status_code == 501
    body = response.json()["detail"]
    assert body["code"] == "MODEL_WEIGHTS_NOT_REGISTERED"
    assert "text" not in body or isinstance(body.get("message"), str)


def test_capabilities_do_not_claim_ocr() -> None:
    client = TestClient(create_app())
    payload = client.get("/v1/capabilities").json()
    by_id = {item["id"]: item["status"] for item in payload["capabilities"]}
    assert by_id["preprocessing"] == "implemented"
    assert by_id["me-03-text-detection"] == "classical_baseline"
    assert by_id["me-04-printed-recognition"] == "weights_required"
    assert by_id["me-05-handwriting"] == "not_implemented"
    assert by_id["me-07-tables"] == "classical_baseline"
    assert by_id["field-extraction"] == "implemented"


def _png() -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("L", (32, 32), color=255).save(buffer, format="PNG")
    return buffer.getvalue()


def test_health() -> None:
    client = TestClient(create_app())
    assert client.get("/v1/health").json()["status"] == "ok"
