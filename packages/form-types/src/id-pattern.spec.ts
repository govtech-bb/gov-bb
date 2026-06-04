import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./id-pattern";

describe("KEBAB_ID_PATTERN", () => {
  it.each(["field", "step-1", "applicant-first-name", "a", "form2"])(
    "accepts well-formed kebab id %p",
    (id) => {
      expect(KEBAB_ID_PATTERN.test(id)).toBe(true);
    },
  );

  it.each([
    "",
    "1-foo",
    "foo-",
    "foo--bar",
    "Foo",
    "-foo",
    "foo_bar",
    "foo bar",
  ])("rejects malformed id %p", (id) => {
    expect(KEBAB_ID_PATTERN.test(id)).toBe(false);
  });
});

describe("KEBAB_ID_ERROR", () => {
  it("is a non-empty human-readable string", () => {
    expect(typeof KEBAB_ID_ERROR).toBe("string");
    expect(KEBAB_ID_ERROR.length).toBeGreaterThan(0);
  });
});
