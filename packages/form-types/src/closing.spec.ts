import {
  isFormClosed,
  formatClosingDateTime,
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "./index";

describe("isFormClosed", () => {
  const closing = "2026-07-09T23:59:00-04:00";

  it("is false when no closing date is set", () => {
    expect(isFormClosed(undefined, new Date("2030-01-01T00:00:00Z"))).toBe(
      false,
    );
  });

  it("is false before the closing instant", () => {
    expect(isFormClosed(closing, new Date("2026-07-09T23:58:00-04:00"))).toBe(
      false,
    );
  });

  it("is true at or after the closing instant", () => {
    expect(isFormClosed(closing, new Date("2026-07-09T23:59:00-04:00"))).toBe(
      true,
    );
    expect(isFormClosed(closing, new Date("2026-07-10T00:00:00-04:00"))).toBe(
      true,
    );
  });

  it("is false for an unparseable value", () => {
    expect(isFormClosed("not-a-date", new Date())).toBe(false);
  });
});

describe("formatClosingDateTime", () => {
  it("renders the AST wall-clock in the mockup's shape", () => {
    expect(formatClosingDateTime("2026-07-09T23:59:00-04:00")).toBe(
      "Thursday, 9 July 2026 at 11:59pm",
    );
  });
});

describe("closingDateTime on the schemas", () => {
  const base = {
    formId: "some-form",
    title: "Some form",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts meta.closingDateTime on a recipe", () => {
    const parsed = serviceContractRecipeSchema.parse({
      ...base,
      meta: {
        visibility: "public",
        closingDateTime: "2026-07-09T23:59:00-04:00",
      },
    });
    expect(parsed.meta?.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
  });

  it("accepts a recipe with no closingDateTime", () => {
    const parsed = serviceContractRecipeSchema.parse({
      ...base,
      meta: { visibility: "public" },
    });
    expect(parsed.meta?.closingDateTime).toBeUndefined();
  });

  it("carries closingDateTime on the served contract", () => {
    const parsed = serviceContractSchema.parse({
      ...base,
      closingDateTime: "2026-07-09T23:59:00-04:00",
    });
    expect(parsed.closingDateTime).toBe("2026-07-09T23:59:00-04:00");
  });
});
