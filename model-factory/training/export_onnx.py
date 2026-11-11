"""Export a trained PrintedCrnn to a fixed-shape ONNX file.

The intelligence service loads this file with ONNX Runtime. Export does not
mark the checkpoint as benchmark-validated.
"""

from __future__ import annotations

from pathlib import Path

import torch

from training.architectures.crnn import PrintedCrnn


def export_printed_onnx(model: PrintedCrnn, output: Path, width: int = 512) -> None:
    model.eval()
    dummy = torch.zeros(1, 1, 32, width)
    output.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (dummy,),
        str(output),
        input_names=["images"],
        output_names=["logits"],
        opset_version=17,
        dynamo=False,
    )
