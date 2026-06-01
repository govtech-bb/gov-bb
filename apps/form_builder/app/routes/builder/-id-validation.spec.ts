import { KEBAB_ID_PATTERN, kebabize } from "./-id-validation";

// ── KEBAB_ID_PATTERN ─────────────────────────────────────────────────────────

describe("KEBAB_ID_PATTERN", () => {
  it("accepts a multi-segment kebab id", () => {
    expect(KEBAB_ID_PATTERN.test("applicant-first-name")).toBe(true);
  });

  it("accepts a single lowercase word", () => {
    expect(KEBAB_ID_PATTERN.test("field")).toBe(true);
  });

  it("accepts a single letter", () => {
    expect(KEBAB_ID_PATTERN.test("a")).toBe(true);
  });

  it("accepts a letter followed by a digit", () => {
    expect(KEBAB_ID_PATTERN.test("a1")).toBe(true);
  });

  it("accepts a segment ending in a digit", () => {
    expect(KEBAB_ID_PATTERN.test("step-1")).toBe(true);
  });

  it("accepts three kebab segments", () => {
    expect(KEBAB_ID_PATTERN.test("foo-bar-baz")).toBe(true);
  });

  it("rejects a value containing a space", () => {
    expect(KEBAB_ID_PATTERN.test("My Field")).toBe(false);
  });

  it("rejects camelCase", () => {
    expect(KEBAB_ID_PATTERN.test("camelCase")).toBe(false);
  });

  it("rejects snake_case", () => {
    expect(KEBAB_ID_PATTERN.test("snake_case")).toBe(false);
  });

  it("rejects a leading hyphen", () => {
    expect(KEBAB_ID_PATTERN.test("-leading")).toBe(false);
  });

  it("rejects a trailing hyphen", () => {
    expect(KEBAB_ID_PATTERN.test("trailing-")).toBe(false);
  });

  it("rejects a double hyphen", () => {
    expect(KEBAB_ID_PATTERN.test("double--hyphen")).toBe(false);
  });

  it("rejects a value starting with a digit", () => {
    expect(KEBAB_ID_PATTERN.test("1field")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(KEBAB_ID_PATTERN.test("")).toBe(false);
  });

  it("rejects a value made only of punctuation", () => {
    expect(KEBAB_ID_PATTERN.test("!!!")).toBe(false);
  });
});

// ── kebabize ─────────────────────────────────────────────────────────────────

describe("kebabize", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(kebabize("My Field")).toBe("my-field");
  });

  it("does NOT split on camelCase word boundaries (intentional)", () => {
    expect(kebabize("camelCase")).toBe("camelcase");
  });

  it("converts an underscore to a hyphen", () => {
    expect(kebabize("snake_case")).toBe("snake-case");
  });

  it("trims surrounding whitespace", () => {
    expect(kebabize("  spaced  ")).toBe("spaced");
  });

  it("strips leading and trailing separators", () => {
    expect(kebabize("--leading-")).toBe("leading");
  });

  it("lowercases an all-caps word", () => {
    expect(kebabize("UPPER")).toBe("upper");
  });

  it("collapses repeated separators", () => {
    expect(kebabize("a--b")).toBe("a-b");
  });

  it("normalizes a punctuation-only input to an empty string", () => {
    expect(kebabize("!!!")).toBe("");
  });

  it("kebab-cases a three-word title", () => {
    expect(kebabize("Foo Bar Baz")).toBe("foo-bar-baz");
  });

  it("produces output that satisfies KEBAB_ID_PATTERN for a normalized non-empty result", () => {
    expect(KEBAB_ID_PATTERN.test(kebabize("My Field"))).toBe(true);
  });
});
