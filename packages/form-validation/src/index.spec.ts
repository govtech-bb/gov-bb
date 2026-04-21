import { validate } from "./index";
import type { Primitive } from "@govtech-bb/form-types";

const text = (
  fieldId: string,
  validations?: Primitive["validations"],
): Primitive =>
  ({
    fieldId,
    label: fieldId,
    htmlType: "text",
    validations,
  }) as Primitive;

const number = (
  fieldId: string,
  validations?: Primitive["validations"],
): Primitive =>
  ({
    fieldId,
    label: fieldId,
    htmlType: "number",
    validations,
  }) as Primitive;

const checkbox = (
  fieldId: string,
  validations?: Primitive["validations"],
): Primitive =>
  ({
    fieldId,
    label: fieldId,
    htmlType: "checkbox",
    options: [{ label: "A", value: "a" }],
    validations,
  }) as Primitive;

describe("validate()", () => {
  it("returns valid=true when no primitives", () => {
    const result = validate({ primitives: [], stepValues: {} });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("returns valid=true when no validations on any field", () => {
    const result = validate({
      primitives: [text("name"), text("email")],
      stepValues: { name: "Alice", email: "alice@example.com" },
    });
    expect(result.valid).toBe(true);
  });

  it("collects errors for all failing fields (not fail-fast)", () => {
    const result = validate({
      primitives: [
        text("name", { required: {} }),
        text("email", { required: {}, email: {} }),
      ],
      stepValues: { name: "", email: "not-email" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors["name"]).toHaveLength(1);
    expect(result.errors["email"]).toHaveLength(1);
  });

  it("collects multiple rule errors for a single field", () => {
    const result = validate({
      primitives: [
        text("username", {
          required: {},
          minLength: { value: 5 },
          maxLength: { value: 3 },
        }),
      ],
      stepValues: { username: "ab" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors["username"]).toContain(
      "Must be at least 5 characters",
    );
  });

  it("skips all rules when field is empty and not required", () => {
    const result = validate({
      primitives: [text("nickname", { minLength: { value: 5 } })],
      stepValues: { nickname: "" },
    });
    expect(result.valid).toBe(true);
  });

  it("treats required: { value: false } as optional — skips when empty", () => {
    const result = validate({
      primitives: [
        text("nickname", {
          required: { value: false },
          minLength: { value: 5 },
        }),
      ],
      stepValues: { nickname: "" },
    });
    expect(result.valid).toBe(true);
  });

  it("runs minLength on a non-empty optional field", () => {
    const result = validate({
      primitives: [
        text("nickname", {
          required: { value: false },
          minLength: { value: 5 },
        }),
      ],
      stepValues: { nickname: "ab" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors["nickname"]).toContain(
      "Must be at least 5 characters",
    );
  });

  it("treats number 0 as a valid value (not empty)", () => {
    const result = validate({
      primitives: [number("count", { min: { value: 0 } })],
      stepValues: { count: 0 },
    });
    expect(result.valid).toBe(true);
  });

  it("treats empty checkbox array as empty (skips optional rules)", () => {
    const result = validate({
      primitives: [checkbox("interests", { minItems: { value: 1 } })],
      stepValues: { interests: [] },
    });
    expect(result.valid).toBe(true);
  });

  it("validates checkbox minItems when field has values", () => {
    const result = validate({
      primitives: [
        checkbox("interests", { required: {}, minItems: { value: 2 } }),
      ],
      stepValues: { interests: ["a"] },
    });
    expect(result.valid).toBe(false);
    expect(result.errors["interests"]).toContain(
      "Must have at least 2 item(s)",
    );
  });

  it("supports cross-field validation via flat fallback allValues", () => {
    const result = validate({
      primitives: [
        text("confirmPassword", {
          required: {},
          strictEquality: { reference: "password" },
        }),
      ],
      stepValues: { confirmPassword: "wrong" },
      allValues: { "step-1": { password: "secret123" } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors["confirmPassword"]).toContain("Values do not match");
  });

  it("supports cross-field validation scoped to targetStepId", () => {
    const result = validate({
      primitives: [
        text("confirmPassword", {
          required: {},
          strictEquality: { reference: "password", targetStepId: "step-1" },
        }),
      ],
      stepValues: { confirmPassword: "correct" },
      allValues: {
        "step-1": { password: "correct" },
        "step-2": { password: "decoy" },
      },
    });
    expect(result.valid).toBe(true);
  });

  it("skips cross-field rule when referenced field is absent from allValues and stepValues", () => {
    const result = validate({
      primitives: [
        text("confirmPassword", {
          required: {},
          strictEquality: { reference: "password" },
        }),
      ],
      stepValues: { confirmPassword: "anything" },
      allValues: {},
    });
    expect(result.valid).toBe(true);
  });

  it("uses custom error messages", () => {
    const result = validate({
      primitives: [
        text("name", { required: { error: "Please enter your name" } }),
      ],
      stepValues: { name: "" },
    });
    expect(result.errors["name"]).toContain("Please enter your name");
  });

  it("ignores conditionalOn rule (handled by form-conditions, not validator)", () => {
    const result = validate({
      primitives: [
        text("name", { required: {}, conditionalOn: { value: "someField" } }),
      ],
      stepValues: { name: "Alice" },
    });
    expect(result.valid).toBe(true);
  });

  describe("same-step cross-field fallback", () => {
    it("resolves a reference within the current step when allValues is empty", () => {
      const result = validate({
        primitives: [
          number("salary", { required: {}, gt: { reference: "minimum-wage" } }),
          number("minimum-wage", { required: {} }),
        ],
        stepValues: { salary: 85000, "minimum-wage": 40000 },
      });
      expect(result.valid).toBe(true);
    });

    it("fails correctly when same-step reference resolves and rule fails", () => {
      const result = validate({
        primitives: [
          number("salary", { required: {}, gt: { reference: "minimum-wage" } }),
          number("minimum-wage", { required: {} }),
        ],
        stepValues: { salary: 30000, "minimum-wage": 40000 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors["salary"]).toBeDefined();
    });

    it("prefers allValues over stepValues when the reference exists in allValues", () => {
      const result = validate({
        primitives: [
          number("salary", { required: {}, gt: { reference: "minimum-wage" } }),
        ],
        stepValues: { salary: 85000, "minimum-wage": 999 },
        allValues: { "employment-info": { "minimum-wage": 40000 } },
      });
      expect(result.valid).toBe(true);
    });
  });
});
