import {
  generateApplicationCode,
  isServiceCode,
  SERVICES,
} from "./application-code";

describe("application-code", () => {
  it("recognises every catalogued service code and rejects others", () => {
    for (const code of Object.keys(SERVICES)) {
      expect(isServiceCode(code)).toBe(true);
    }
    expect(isServiceCode("NOPE")).toBe(false);
    expect(isServiceCode("byac")).toBe(false);
  });

  it("formats <SERVICE>-<DDMM>-<7 base36>", () => {
    const code = generateApplicationCode(
      "BYAC",
      "sub-1",
      "2026-06-03T09:00:00.000Z",
    );
    expect(code).toMatch(/^BYAC-\d{4}-[0-9A-Z]{7}$/);
  });

  it("is deterministic — same submission → same code (stable across retries)", () => {
    const a = generateApplicationCode("YDP", "sub-abc", "2026-01-09T10:00:00Z");
    const b = generateApplicationCode("YDP", "sub-abc", "2026-01-09T10:00:00Z");
    expect(a).toBe(b);
  });

  it("differs by submission id and by service", () => {
    const at = "2026-01-09T10:00:00Z";
    expect(generateApplicationCode("YDP", "sub-1", at)).not.toBe(
      generateApplicationCode("YDP", "sub-2", at),
    );
    expect(generateApplicationCode("YDP", "sub-1", at)).not.toBe(
      generateApplicationCode("CIP", "sub-1", at),
    );
  });
});
