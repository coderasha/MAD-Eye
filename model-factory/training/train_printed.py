"""ME-04 training entry point.

Without a dataset manifest the process exits. `--smoke` runs a few optimiser
steps on synthetic glyphs and writes a checkpoint that cannot be registered
as a benchmarked model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import torch

from evaluation.metrics import build_report
from training.architectures.crnn import PrintedCrnn, ctc_loss, greedy_decode
from training.charsets.english import ENGLISH_CHARSET, charset_size, decode_indices, encode_text
from training.export_onnx import export_printed_onnx
from training.synthetic import render_line


def prepare_batch(texts: list[str], charset: str, device: torch.device) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    images = []
    target_lists = []
    width = 0
    for text in texts:
        array = render_line(text)
        width = max(width, array.shape[1])
        images.append(array)
        target_lists.append(encode_text(text, charset))
    width += (4 - width % 4) % 4
    batched = torch.ones((len(images), 1, 32, width), dtype=torch.float32)
    for index, array in enumerate(images):
        tensor = torch.from_numpy(np.array(array, copy=True)).float() / 255.0
        batched[index, 0, :, : tensor.shape[1]] = tensor
    targets = torch.tensor([index for sequence in target_lists for index in sequence], dtype=torch.long)
    lengths = torch.tensor([len(sequence) for sequence in target_lists], dtype=torch.long)
    return batched.to(device), targets.to(device), lengths.to(device)


def smoke_train(steps: int, output: Path, charset: str = ENGLISH_CHARSET) -> dict[str, object]:
    device = torch.device("cpu")
    model = PrintedCrnn(charset_size(charset)).to(device)
    optimiser = torch.optim.Adam(model.parameters(), lr=1e-3)
    first = charset[0]
    second = charset[min(1, len(charset) - 1)]
    samples = [first, second, first + second]
    last_loss = None
    model.train()
    for _step in range(steps):
        images, targets, lengths = prepare_batch(samples, charset, device)
        logits = model(images)
        loss = ctc_loss(logits, targets, lengths)
        if not torch.isfinite(loss):
            raise RuntimeError("CTC loss was not finite")
        optimiser.zero_grad(set_to_none=True)
        loss.backward()
        optimiser.step()
        last_loss = float(loss.detach().cpu())
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "architecture": "me04_crnn_v1",
        "charset": charset,
        "model_state": model.state_dict(),
        "steps": steps,
        "final_loss": last_loss,
        "dataset": "synthetic_smoke",
        "benchmark_validated": False,
    }
    torch.save(payload, output)
    summary = {
        "architecture": payload["architecture"],
        "steps": steps,
        "finalLoss": last_loss,
        "dataset": "synthetic_smoke",
        "benchmarkValidated": False,
        "checkpoint": str(output),
    }
    output.with_suffix(".json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def _fit(model: PrintedCrnn, texts: list[str], charset: str, steps: int, device: torch.device) -> float | None:
    optimiser = torch.optim.Adam(model.parameters(), lr=1e-3)
    last_loss = None
    model.train()
    for _step in range(steps):
        for start in range(0, len(texts), 8):
            chunk = texts[start : start + 8]
            images, targets, lengths = prepare_batch(chunk, charset, device)
            logits = model(images)
            loss = ctc_loss(logits, targets, lengths)
            if not torch.isfinite(loss):
                raise RuntimeError("CTC loss was not finite")
            optimiser.zero_grad(set_to_none=True)
            loss.backward()
            optimiser.step()
            last_loss = float(loss.detach().cpu())
    return last_loss


def _predict(model: PrintedCrnn, text: str, charset: str, device: torch.device) -> str:
    model.eval()
    images, _targets, _lengths = prepare_batch([text], charset, device)
    with torch.no_grad():
        logits = model(images)
    indices = greedy_decode(logits)[0]
    return decode_indices(indices, charset)


def export_synthetic(steps: int, output_dir: Path, charset: str = ENGLISH_CHARSET) -> dict[str, object]:
    """Train on bitmap glyphs and write ONNX plus a measured synthetic report.

    The report is not a benchmark. `benchmarkValidated` stays false.
    """
    device = torch.device("cpu")
    model = PrintedCrnn(charset_size(charset)).to(device)
    glyphs = [char for char in charset if not char.isspace()]
    training = glyphs + ["Invoice 18", "MAD-EYE 123", "Date 2026-01-02", "10", "AB"]
    held_out = ["2", "B", "Invoice 19", "Date 2026-03-04"]
    last_loss = _fit(model, training, charset, steps, device)
    pairs = [(text, _predict(model, text, charset, device)) for text in held_out]
    report = build_report(pairs)
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / "me04.onnx"
    export_printed_onnx(model, onnx_path)
    digest = hashlib.sha256(onnx_path.read_bytes()).hexdigest()
    manifest = {
        "modelCode": "me-04-printed-recognition",
        "version": "0.1.0-synthetic",
        "status": "synthetic_unvalidated",
        "weightsPath": onnx_path.name,
        "weightsSha256": digest,
        "benchmarkValidated": False,
        "dataset": "synthetic_bitmap_font",
        "charset": charset,
        "syntheticCer": report["cer"],
        "syntheticWer": report["wer"],
        "sampleCount": report["sampleCount"],
        "finalLoss": last_loss,
        "steps": steps,
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    torch.save({"architecture": "me04_crnn_v1", "charset": charset, "model_state": model.state_dict(), "benchmark_validated": False}, output_dir / "me04.pt")
    return {"manifest": str(manifest_path), **{key: manifest[key] for key in ("syntheticCer", "syntheticWer", "benchmarkValidated", "steps")}}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train ME-04 printed recognition")
    parser.add_argument("--manifest", type=Path, help="Dataset manifest. Required unless --smoke is set.")
    parser.add_argument("--smoke", action="store_true", help="Run a synthetic smoke loop. Not a benchmark.")
    parser.add_argument("--steps", type=int, default=3)
    parser.add_argument("--output", type=Path, default=Path("model-factory/experiments/smoke/me04.pt"))
    parser.add_argument("--export-synthetic", action="store_true", help="Train bitmap glyphs and write an unvalidated ONNX manifest.")
    parser.add_argument("--output-dir", type=Path, default=Path("model-factory/experiments/synthetic-en"))
    args = parser.parse_args()
    if args.export_synthetic:
        print(json.dumps(export_synthetic(args.steps, args.output_dir)))
        return
    if args.smoke:
        summary = smoke_train(args.steps, args.output)
        print(json.dumps(summary))
        return
    if args.manifest is None:
        raise SystemExit(
            "No training manifest configured. Refusing to train on undeclared data. "
            "Pass --smoke for a synthetic loop that does not produce a benchmark."
        )
    raise SystemExit(
        "Manifest training is not enabled until the held-out split is physically separated "
        "from this entry point. No weights were written."
    )


if __name__ == "__main__":
    main()
