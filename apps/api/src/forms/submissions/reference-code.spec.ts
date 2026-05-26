import { generateReferenceCode } from "./reference-code";

describe("generateReferenceCode", () => {
  it("uses uppercase first-letter-of-each-segment prefix", () => {
    expect(generateReferenceCode("passport-renewal")).toMatch(/^PR-/);
    expect(generateReferenceCode("apply-for-conductor-licence")).toMatch(
      /^AFCL-/,
    );
    expect(generateReferenceCode("single")).toMatch(/^S-/);
  });

  it("includes YYYYMMDD-HHMMSS date/time", () => {
    const now = new Date("2026-05-15T10:45:30.000Z");
    expect(generateReferenceCode("x", { now })).toMatch(/^X-20260515-104530-/);
  });

  it("uses 6 chars from the unambiguous alphabet [A-HJ-NP-Z2-9]", () => {
    const code = generateReferenceCode("x", { now: new Date(0) });
    const tail = code.split("-").pop()!;
    expect(tail).toHaveLength(6);
    expect(tail).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("produces different tails on repeated calls", () => {
    const tails = new Set(
      Array.from({ length: 20 }, () =>
        generateReferenceCode("x").split("-").pop(),
      ),
    );
    expect(tails.size).toBeGreaterThan(15);
  });
});
