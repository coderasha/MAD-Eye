import { describe, expect, it } from "vitest";
import { builtinTemplates, parseTemplate } from "./index.js";

describe("extraction templates", () => {
  it("parses the built-in templates as configuration only", () => {
    for (const template of builtinTemplates) {
      expect(parseTemplate(template).fields.length).toBeGreaterThan(0);
    }
  });
});
