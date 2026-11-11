# Model development plan

MAD-EYE recognition models are trained and versioned here. A third-party OCR library is not a production dependency and is not vendored.

## What exists now

### Vision quality (classical)

`intelligence/services/preprocessing` measures blur (Laplacian variance), noise (mean absolute residual against a median filter), skew (projection-profile search), contrast, illumination unevenness, pixel dimensions, and DPI when the file states it. Thresholds classify the measurements. They are not calibrated probabilities and they have not been scored on a labelled set. The 99.5% orientation target is **not** claimed. Upside-down detection is not attempted.

### ME-04 printed text recognition

- Architecture: `model-factory/training/architectures/crnn.py`. Convolutional stack, two-layer bidirectional LSTM, linear projection, CTC loss. Blank index is 0.
- English charset: digits, Latin letters, and a small punctuation set in `training/charsets/english.py`.
- Decoder: greedy CTC collapse. Beam search is not implemented.
- Trainer: `training/train_printed.py`. Without a dataset manifest it exits. `--smoke` trains a few steps on glyphs drawn with the default bitmap font and writes a checkpoint whose dataset label is `synthetic_smoke`.
- Metrics: character error rate and word error rate in `evaluation/metrics.py`, with code-point or Unicode grapheme-cluster mode.
- The report builder cannot set `benchmarkValidated` to true.

No ME-04 checkpoint is registered for inference. `POST /v1/recognise` does not load this network, because an untrained or smoke-trained network must not be presented as OCR.

### ONNX gate

`intelligence/runtime/onnx_runtime.py` loads a session only when the manifest has a weights path and the SHA-256 matches. A missing weight file raises `ModelWeightsNotRegistered`.

## What does not exist

| Model | Gap |
| --- | --- |
| ME-01 learned quality classifier | Classical metrics only. |
| ME-02 script and language identification | Not implemented. No language routing. |
| ME-03 text detection | Not implemented. No DBNet. |
| ME-05 handwriting | Not implemented. No dataset. |
| ME-06 layout | Not implemented. |
| ME-07 tables | Not implemented. |
| ME-08 document classification | Not implemented. |
| Hindi, Odia, and later scripts | No charset, no data, no model. Grapheme CER is ready for evaluation when data exists. |

## Training rules

1. Splits are declared in a dataset manifest before training. The held-out split is not readable by the trainer.
2. MLflow is the tracking system. A file store under `model-factory/experiments/` is the default. Experiment directories are gitignored.
3. DVC is the intended store for large datasets and weights. Remote configuration is an operator choice and is not pointed at a public bucket in this repository.
4. Checkpoints record architecture name, charset, dataset version, step count, and `benchmarkValidated: false`.
5. Publishing a version to `model-registry/manifests/` requires a checksum. Evaluation numbers in that file must be copied from a report, never typed in as a target.
6. Customer documents are excluded unless a governance record says otherwise. The upload path has no branch that copies objects into `datasets/`.

## Initial quality targets

The product brief's English printed CER and WER targets remain targets. They are not measurements. Hindi, Odia, handwriting, and degraded scans need their own targets before anyone calls them ready.

## Inference interface

Every future model module implements:

```text
load(manifest) -> None
predict(batch) -> list[Result]
```

`Result` includes hypothesis, raw score, calibrated flag, model code, and model version. The confidence service maps those numbers to `RECOGNISED`, `RECOGNISED_WITH_WARNING`, `NEEDS_REVIEW`, `UNREADABLE`, or `VALIDATION_FAILED`. Disagreement between hypotheses becomes `NEEDS_REVIEW`. There is no majority vote and no rewrite of the original hypothesis.
