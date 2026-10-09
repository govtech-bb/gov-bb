import { redactEmailsIn, redactPii, sanitizeForLog } from "./log-sanitize";

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

  // #2971: characters JSON.stringify doesn't escape that some log viewers
  // render as line breaks or reversed text, so a crafted value can visually
  // forge part of a log line.
  it.each([
    ["line separator U+2028", 0x2028],
    ["paragraph separator U+2029", 0x2029],
    ["left-to-right mark U+200E", 0x200e],
    ["right-to-left mark U+200F", 0x200f],
    ["right-to-left override U+202E", 0x202e],
    ["left-to-right embedding U+202A", 0x202a],
    ["right-to-left isolate U+2067", 0x2067],
    ["pop directional isolate U+2069", 0x2069],
    ["next line (C1) U+0085", 0x85],
    ["arabic letter mark U+061C", 0x061c],
    ["zero-width space U+200B", 0x200b],
    ["zero-width non-joiner U+200C", 0x200c],
    ["word joiner U+2060", 0x2060],
    ["invisible plus U+2064", 0x2064],
    ["zero-width no-break space / BOM U+FEFF", 0xfeff],
    ["interlinear annotation anchor U+FFF9", 0xfff9],
    ["interlinear annotation terminator U+FFFB", 0xfffb],
    ["control sequence introducer (C1) U+009B", 0x9b],
  ])("replaces the %s with a space", (_, code) => {
    expect(sanitizeForLog(`a${String.fromCodePoint(code)}b`)).toBe("a b");
  });

  it("keeps the zero-width joiner, so joined emoji survive", () => {
    const family = "👨\u200d👩\u200d👧";
    expect(sanitizeForLog(family)).toBe(family);
  });

  it("leaves ordinary non-ASCII text untouched", () => {
    expect(sanitizeForLog("Café — بربادوس 💧")).toBe("Café — بربادوس 💧");
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

describe("redactEmailsIn (#2971)", () => {
  it("masks every address inside free text, such as a delivery error", () => {
    const message =
      "MessageRejected: Email address is not verified. The following identities failed the check in region EU-WEST-1: jane@example.com, bob.smith@gov.bb";
    const cleaned = redactEmailsIn(message);
    expect(cleaned).toContain("j***@example.com");
    expect(cleaned).toContain("b***@gov.bb");
    expect(cleaned).not.toContain("jane@");
    expect(cleaned).not.toContain("bob.smith");
  });

  it("masks the whole local part when it has an apostrophe", () => {
    const cleaned = redactEmailsIn("rejected: mary.o'connor@example.com");
    expect(cleaned).toContain("m***@example.com");
    expect(cleaned).not.toContain("connor");
  });

  it("leaves text without an address as it was", () => {
    expect(redactEmailsIn("Throttling: Maximum sending rate exceeded.")).toBe(
      "Throttling: Maximum sending rate exceeded.",
    );
  });

  it("stays fast on long hostile text (no regex blow-up)", () => {
    // An "@" with no domain after a long run made the email pattern retry from
    // every start position: quadratic, ~43s for 200k characters.
    const started = Date.now();
    const cleaned = redactEmailsIn(`${"a".repeat(200_000)}@`);
    expect(Date.now() - started).toBeLessThan(500);
    expect(cleaned.length).toBeLessThanOrEqual(201);
  });

  it("still masks an address that straddles the logged length", () => {
    const cleaned = redactEmailsIn(`${"x ".repeat(95)}jane.doe@example.com`);
    expect(cleaned).not.toContain("jane.doe");
  });

  it("is still log-safe: control characters stripped, length bounded", () => {
    const cleaned = redactEmailsIn(`a\n${"x".repeat(500)}`);
    expect(cleaned).not.toContain("\n");
    expect(cleaned.length).toBeLessThanOrEqual(201);
  });
});
