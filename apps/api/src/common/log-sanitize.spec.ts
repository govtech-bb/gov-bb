import { redactPii, sanitizeForLog } from "./log-sanitize";

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

describe("redactPii", () => {
  it("masks an email to its first character plus domain", () => {
    expect(redactPii("jane@gmail.com")).toBe("j***@gmail.com");
  });

  it("never reveals the local part beyond its first character, nor its length", () => {
    const masked = redactPii("jonathan@example.com");
    expect(masked).toBe("j***@example.com");
    expect(masked).not.toContain("jonathan");
  });

  it("fully redacts a value that is not an email (name, phone)", () => {
    expect(redactPii("Jane Doe")).toBe("[hidden]");
    expect(redactPii("+1 246 555 0100")).toBe("[hidden]");
  });

  it("fully redacts a malformed address — empty local part or missing domain", () => {
    expect(redactPii("@example.com")).toBe("[hidden]");
    expect(redactPii("jane@")).toBe("[hidden]");
  });

  it("redacts null/undefined without throwing", () => {
    expect(redactPii(null)).toBe("[hidden]");
    expect(redactPii(undefined)).toBe("[hidden]");
  });

  it("strips control characters from the caller-supplied domain (log injection)", () => {
    const masked = redactPii(`jane@evil.com${NUL}${ESC}[31m`);
    expect(masked).not.toContain(NUL);
    expect(masked).not.toContain(ESC);
    expect(masked.startsWith("j***@evil.com")).toBe(true);
  });
});
