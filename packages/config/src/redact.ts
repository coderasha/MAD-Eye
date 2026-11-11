const SENSITIVE = /password|authorization|cookie|token|secret|api[-_]?key/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE.test(key) ? "[redacted]" : redact(item);
    }
    return output;
  }
  return value;
}
