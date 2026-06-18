import { isServiceCode, SERVICES } from "./application-code";

describe("application-code", () => {
  it("recognises every catalogued service code and rejects others", () => {
    for (const code of Object.keys(SERVICES)) {
      expect(isServiceCode(code)).toBe(true);
    }
    expect(isServiceCode("NOPE")).toBe(false);
    expect(isServiceCode("byac")).toBe(false);
  });
});
