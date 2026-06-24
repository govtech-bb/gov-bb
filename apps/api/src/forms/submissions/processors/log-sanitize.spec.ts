import { sanitizeForLog } from "./log-sanitize";

const ESC = String.fromCharCode(0x1b); // ANSI escape
const NUL = String.fromCharCode(0); // null byte

describe("sanitizeForLog", () => {
  it("leaves ordinary values untouched", () => {
    expect(sanitizeForLog("youth-opportunity-byac")).toBe(
      "youth-opportunity-byac",
    );
  });

  it("strips newlines and carriage returns that could forge log lines", () => {
    const forged = "byac\r\n[ERROR] injected admin login";
    const cleaned = sanitizeForLog(forged);
    expect(cleaned).not.toContain("\n");
    expect(cleaned).not.toContain("\r");
    expect(cleaned).toBe("byac  [ERROR] injected admin login");
  });

  it("replaces terminal-escape and NUL control characters with spaces", () => {
    expect(sanitizeForLog(`a${ESC}[31mb${NUL}c`)).toBe("a [31mb c");
  });

  it("truncates oversized values", () => {
    const cleaned = sanitizeForLog("x".repeat(500));
    expect(cleaned.length).toBe(201); // 200 chars + ellipsis
    expect(cleaned.endsWith("…")).toBe(true);
  });

  it("coerces non-string values", () => {
    expect(sanitizeForLog(42)).toBe("42");
    expect(sanitizeForLog(null)).toBe("null");
  });
});
