import { applyFieldOverrides } from "./resolution-merge";
import type { Primitive, FieldOverrides } from "./primitive.type";

const basePrimitive = (): Primitive =>
  ({
    fieldId: "given-name",
    label: "First name",
    htmlType: "text",
    validations: {
      required: { error: "Required" },
      maxLength: { value: 20 },
    },
    ui: { width: "short", hideLabel: false },
  }) as Primitive;

describe("applyFieldOverrides", () => {
  it("shallow-replaces top-level keys the override restates", () => {
    const merged = applyFieldOverrides(basePrimitive(), {
      label: "Given name",
    } as FieldOverrides);

    expect(merged.label).toBe("Given name");
    expect(merged.fieldId).toBe("given-name");
  });

  it("deep-merges validations: an override key must not drop other shipped keys (#371)", () => {
    const merged = applyFieldOverrides(basePrimitive(), {
      validations: { maxLength: { value: 50 } },
    } as FieldOverrides);

    // override wins on the restated key
    expect(merged.validations).toEqual({
      required: { error: "Required" },
      maxLength: { value: 50 },
    });
  });

  it("deep-merges ui: an override key must not drop other shipped keys (#789)", () => {
    const merged = applyFieldOverrides(basePrimitive(), {
      ui: { hideLabel: true },
    } as FieldOverrides);

    expect(merged.ui).toEqual({ width: "short", hideLabel: true });
  });

  it("omits validations and ui entirely when neither base nor override has them", () => {
    const bare = {
      fieldId: "given-name",
      label: "First name",
      htmlType: "text",
    } as Primitive;

    const merged = applyFieldOverrides(bare, {
      label: "Given name",
    } as FieldOverrides);

    expect(merged).not.toHaveProperty("validations");
    expect(merged).not.toHaveProperty("ui");
    expect(merged.label).toBe("Given name");
  });

  it("leaves validations and ui untouched when the override omits them", () => {
    const merged = applyFieldOverrides(basePrimitive(), {
      label: "Given name",
    } as FieldOverrides);

    expect(merged.validations).toEqual({
      required: { error: "Required" },
      maxLength: { value: 20 },
    });
    expect(merged.ui).toEqual({ width: "short", hideLabel: false });
  });
});
