import {
  generateApplicationCode,
  generateApplicationCodeForService,
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

  it("formats <SERVICE>-<DDMM>-<3 counter><4 random>", () => {
    const code = generateApplicationCode("BYAC", 0, new Date(2026, 5, 3));
    expect(code).toMatch(/^BYAC-0306-[0-9A-Z]{7}$/);
    expect(code.startsWith("BYAC-0306-000")).toBe(true);
  });

  it("encodes the counter in base36 uppercase", () => {
    // 35 -> 'Z' padded to width 3 => '00Z'
    const code = generateApplicationCode("YDP", 35, new Date(2026, 0, 9));
    expect(code).toMatch(/^YDP-0901-00Z[0-9A-Z]{4}$/);
  });

  it("throws when the counter exceeds 3-char base36 capacity", () => {
    expect(() => generateApplicationCode("CIP", 36 ** 3)).toThrow();
  });

  it("generateApplicationCodeForService produces a valid code for the service", () => {
    const code = generateApplicationCodeForService("SPARKS");
    expect(code).toMatch(/^SPARKS-\d{4}-[0-9A-Z]{7}$/);
  });
});
