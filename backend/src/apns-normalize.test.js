import { describe, it, expect } from "vitest";
import { normalizeApnsP8String } from "./apns.js";

describe("normalizeApnsP8String", () => {
  it("convertit les \\n littéraux en vrais retours à la ligne", () => {
    const oneLine = `"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----"`;
    const out = normalizeApnsP8String(oneLine);
    expect(out).toContain("\n");
    expect(out).toContain("-----BEGIN PRIVATE KEY-----");
    expect(out).not.toContain("\\n");
  });

  it("retire les guillemets JSON autour du PEM", () => {
    const wrapped = `"-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----"`;
    const out = normalizeApnsP8String(wrapped);
    expect(out.startsWith('"')).toBe(false);
    expect(out).toContain("BEGIN PRIVATE KEY");
  });
});
