from pathlib import Path

import onnxruntime as ort

from training.architectures.crnn import PrintedCrnn
from training.charsets.english import charset_size
from training.export_onnx import export_printed_onnx


def test_exported_graph_accepts_the_inference_shape(tmp_path: Path) -> None:
    charset = "ab"
    model = PrintedCrnn(charset_size(charset))
    output = tmp_path / "me04.onnx"
    export_printed_onnx(model, output)
    session = ort.InferenceSession(output.read_bytes(), providers=["CPUExecutionProvider"])
    import numpy as np

    logits = session.run(None, {"images": np.zeros((1, 1, 32, 512), dtype=np.float32)})[0]
    assert logits.shape[0] == 1
    assert logits.shape[2] == charset_size(charset)
