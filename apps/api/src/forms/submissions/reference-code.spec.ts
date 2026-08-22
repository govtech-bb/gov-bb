import {
  canonicalizeReferenceCode,
  generateReferenceCode,
  referencePrefixFromProcessors,
} from "./reference-code";

describe("generateReferenceCode", () => {
  it("derives an uppercase first-letter-of-each-segment prefix from the formId", () => {
    expect(generateReferenceCode("passport-renewal")).toMatch(/^PR-/);
    expect(generateReferenceCode("apply-for-conductor-licence")).toMatch(
      /^AFCL-/,
    );
    expect(generateReferenceCode("single")).toMatch(/^S-/);
  });

  it("uses an explicit prefix when supplied (e.g. a programme code), uppercased", () => {
    expect(
      generateReferenceCode("youth-opportunity-byac", { prefix: "BYAC" }),
    ).toMatch(/^BYAC-/);
    expect(generateReferenceCode("x", { prefix: "camp" })).toMatch(/^CAMP-/);
  });

  it("includes a YYMM (2-digit year + month) date part", () => {
    const now = new Date("2026-06-15T10:45:30.000Z");
    expect(generateReferenceCode("x", { now })).toMatch(/^X-2606-/);
    const jan = new Date("2027-01-02T00:00:00.000Z");
    expect(generateReferenceCode("x", { now: jan })).toMatch(/^X-2701-/);
  });

  it("uses a 7-char Crockford Base32 tail (excludes I, L, O, U)", () => {
    const code = generateReferenceCode("x", { now: new Date(0) });
    const tail = code.split("-").pop()!;
    expect(tail).toHaveLength(7);
    expect(tail).toMatch(/^[0-9A-HJKMNP-TV-Z]{7}$/);
    expect(tail).not.toMatch(/[ILOU]/);
  });

  it("is canonical uppercase end to end", () => {
    const code = generateReferenceCode("youth-opportunity-byac", {
      prefix: "byac",
      now: new Date("2026-06-15T00:00:00.000Z"),
    });
    expect(code).toBe(code.toUpperCase());
    expect(code).toMatch(/^BYAC-2606-[0-9A-HJKMNP-TV-Z]{7}$/);
  });

  it("produces different tails on repeated calls", () => {
    const tails = new Set(
      Array.from({ length: 20 }, () =>
        generateReferenceCode("x").split("-").pop(),
      ),
    );
    expect(tails.size).toBeGreaterThan(15);
  });

  it("generates no collisions across a large batch (CSPRNG entropy check)", () => {
    // Statistical guard on the generator itself. The DB unique constraint +
    // retry-on-collision is the real guarantee (see SubmissionsService); this
    // ensures the entropy is high enough that retries stay vanishingly rare.
    const N = 50_000;
    const codes = new Set<string>();
    for (let i = 0; i < N; i++) {
      codes.add(generateReferenceCode("byac", { prefix: "BYAC" }));
    }
    expect(codes.size).toBe(N);
  });
});

describe("canonicalizeReferenceCode", () => {
  it("applies the Crockford decode rules: O→0, I→1, L→1", () => {
    expect(canonicalizeReferenceCode("MOH-TRL-2608-47E4AD6")).toBe(
      "M0H-TR1-2608-47E4AD6",
    );
    expect(canonicalizeReferenceCode("RAEHO-2608-1CHHHVK")).toBe(
      "RAEH0-2608-1CHHHVK",
    );
  });

  it("uppercases, so a lowercased code still matches", () => {
    expect(canonicalizeReferenceCode("moh-trl-2608-47e4ad6")).toBe(
      canonicalizeReferenceCode("MOH-TRL-2608-47E4AD6"),
    );
  });

  it("resolves the letter/digit ambiguity a reader cannot see", () => {
    // A clerk reading RAEHO off a printed confirmation types a zero.
    expect(canonicalizeReferenceCode("RAEH0-2608-1CHHHVK")).toBe(
      canonicalizeReferenceCode("RAEHO-2608-1CHHHVK"),
    );
  });

  it("leaves a generated code's tail and date untouched", () => {
    // The tail alphabet excludes I/L/O/U and YYMM is digits, so canonicalising
    // a generated code can only ever change its prefix.
    const code = generateReferenceCode("x", {
      prefix: "MYS",
      now: new Date("2026-06-15T00:00:00.000Z"),
    });
    const [, ...rest] = code.split("-");
    const [, ...canonicalRest] = canonicalizeReferenceCode(code).split("-");
    expect(canonicalRest).toEqual(rest);
  });
});

describe("referencePrefixFromProcessors", () => {
  const webhook = (mapping: Record<string, unknown>) => [
    { type: "webhook", config: { mapping } },
  ];

  it("composes MDA-PROG from the webhook mapping", () => {
    expect(
      referencePrefixFromProcessors(
        webhook({ mdaCode: "MOH", programmeShortCode: "TRL" }),
      ),
    ).toBe("MOH-TRL");
  });

  it("returns undefined when the form declares neither segment", () => {
    expect(referencePrefixFromProcessors(webhook({}))).toBeUndefined();
    expect(referencePrefixFromProcessors([])).toBeUndefined();
  });

  it("returns undefined when only one segment is declared", () => {
    // A half-migrated recipe falls back to the formId prefix rather than
    // minting a third shape of code.
    expect(
      referencePrefixFromProcessors(webhook({ mdaCode: "MOH" })),
    ).toBeUndefined();
    expect(
      referencePrefixFromProcessors(webhook({ programmeShortCode: "TRL" })),
    ).toBeUndefined();
  });

  it("ignores processors that are not webhooks", () => {
    expect(
      referencePrefixFromProcessors([
        {
          type: "email",
          config: { mdaCode: "MOH", programmeShortCode: "TRL" },
        },
      ]),
    ).toBeUndefined();
  });
});
