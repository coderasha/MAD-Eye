/** Honest registry rows. Metrics stay null until a measured report exists. */

export const MODEL_CATALOG = [
  {
    code: "me-01-vision-quality",
    name: "Vision quality",
    family: "ME-01",
    task: "image_quality",
    description:
      "Deterministic blur, noise, skew, contrast, shadow, and resolution measures. Not a trained network and not benchmark-validated.",
    version: "0.1.0-classical",
    status: "CLASSICAL_BASELINE" as const,
  },
  {
    code: "me-04-printed-recognition",
    name: "Printed text recognition",
    family: "ME-04",
    task: "printed_text_recognition",
    description:
      "CNN, bidirectional LSTM, and CTC. Inference runs only from a checksummed ONNX file. A synthetic bitmap-font checkpoint is not a benchmark and cannot be treated as production accuracy.",
    version: "0.1.0-synthetic",
    status: "ARCHITECTURE_DEFINED" as const,
  },
];
