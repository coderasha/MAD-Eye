import { describe, expect, it } from "vitest";
import { frameInstream, interpretScan } from "./scanner.js";

describe("clamd framing", () => {
  it("wraps bytes in an INSTREAM frame", () => {
    const framed = frameInstream(Buffer.from("abc"));
    expect(framed.subarray(0, 9).toString("utf8")).toBe("zINSTREAM");
    expect(framed.subarray(framed.length - 4).equals(Buffer.alloc(4))).toBe(true);
  });

  it("does not treat an unknown response as clean", () => {
    expect(interpretScan("stream: OK")).toBe("clean");
    expect(interpretScan("stream: Eicar FOUND")).toBe("infected");
    expect(() => interpretScan("")).toThrow();
  });
});
