import numpy as np
from PIL import Image, ImageDraw

from services.detection.lines import detect_lines
from services.extraction.labels import extract_labelled_values
from services.recognition.ctc import decode_charset, greedy_decode, prepare_line
from services.tables.ruled import detect_ruled_tables


def test_line_detector_finds_a_drawn_stroke() -> None:
    image = np.full((120, 400), 255, dtype=np.uint8)
    image[48:72, 30:280] = 0
    boxes = detect_lines(image)
    assert boxes
    assert any(box["width"] > 40 and box["height"] > 8 for box in boxes)


def test_line_tensor_keeps_the_crop_width() -> None:
    image = np.full((40, 20), 255, dtype=np.uint8)
    image[8:32, 4:16] = 0
    tensor = prepare_line(image)
    assert tensor.shape[0] == 1
    assert tensor.shape[1] == 1
    assert tensor.shape[2] == 32
    assert tensor.shape[3] % 4 == 0
    assert tensor.shape[3] < 512


def test_blank_page_has_no_lines() -> None:
    assert detect_lines(np.full((80, 80), 255, dtype=np.uint8)) == []


def test_ruled_grid_becomes_cells_and_a_blank_page_does_not() -> None:
    image = np.full((200, 300), 255, dtype=np.uint8)
    image[40, :] = 0
    image[100, :] = 0
    image[160, :] = 0
    image[:, 20] = 0
    image[:, 150] = 0
    image[:, 270] = 0
    image[38:43, :] = 0
    image[98:103, :] = 0
    image[158:163, :] = 0
    image[:, 18:23] = 0
    image[:, 148:153] = 0
    image[:, 268:273] = 0
    tables = detect_ruled_tables(image)
    assert tables
    assert tables[0]["rowCount"] == 2
    assert tables[0]["colCount"] == 2
    assert detect_ruled_tables(np.full((80, 80), 255, dtype=np.uint8)) == []


def test_label_extraction_does_not_invent_a_missing_field() -> None:
    lines = [
        {"text": "Invoice 18", "confidence": 0.4, "outputState": "NEEDS_REVIEW", "regionIndex": 0, "pageIndex": 0},
    ]
    found = extract_labelled_values(lines, ["Invoice", "GSTIN"])
    assert len(found) == 1
    assert found[0]["valueText"] == "18"
    assert found[0]["fieldKey"] == "invoice"


def test_greedy_decode_collapses_blanks_and_repeats() -> None:
    logits = np.full((5, 3), -8.0)
    logits[0, 1] = 5
    logits[1, 1] = 5
    logits[2, 0] = 5
    logits[3, 2] = 4
    logits[4, 0] = 5
    indices, confidence = greedy_decode(logits)
    assert indices == [1, 2]
    assert decode_charset(indices, "ab") == "ab"
    assert 0 < confidence <= 1


def test_pil_text_is_detected() -> None:
    image = Image.new("L", (320, 80), color=255)
    ImageDraw.Draw(image).text((12, 28), "Invoice 18", fill=0)
    boxes = detect_lines(np.asarray(image))
    assert boxes
