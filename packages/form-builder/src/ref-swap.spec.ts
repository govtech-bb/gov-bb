import { getCatalog } from "./catalog";
import {
  SWAP_GROUPS,
  getSwappableRefs,
  migrateOverridesForRef,
} from "./ref-swap";
import type { FieldOverrides } from "@govtech-bb/form-types";

const catalog = getCatalog();

describe("SWAP_GROUPS", () => {
  it("groups text-like and choice html types", () => {
    expect(SWAP_GROUPS["text-like"]).toEqual([
      "text",
      "textarea",
      "tel",
      "number",
      "email",
    ]);
    expect(SWAP_GROUPS.choice).toEqual(["select", "radio", "checkbox"]);
  });
});

describe("getSwappableRefs", () => {
  it("returns the other generic primitives in the text-like group for a generic text field", () => {
    const refs = getSwappableRefs("components/generic-text", catalog);
    expect(refs.map((r) => r.ref).sort()).toEqual(
      [
        "components/generic-textarea",
        "components/generic-tel",
        "components/generic-number",
        "components/generic-email",
      ].sort(),
    );
    // excludes the current ref
    expect(refs.map((r) => r.ref)).not.toContain("components/generic-text");
    // every candidate is in the text-like group
    for (const r of refs) {
      expect(SWAP_GROUPS["text-like"]).toContain(r.htmlType);
    }
  });

  it("offers all five generic text-like peers for a named text component (current ref is not a generic)", () => {
    const refs = getSwappableRefs("components/first-name", catalog);
    expect(refs.map((r) => r.ref).sort()).toEqual(
      [
        "components/generic-text",
        "components/generic-textarea",
        "components/generic-tel",
        "components/generic-number",
        "components/generic-email",
      ].sort(),
    );
  });

  it("returns radio and checkbox generics for a generic select field", () => {
    const refs = getSwappableRefs("components/generic-select", catalog);
    expect(refs.map((r) => r.ref).sort()).toEqual(
      ["components/generic-radio", "components/generic-checkbox"].sort(),
    );
  });

  it("carries a human-readable displayName for each candidate", () => {
    const refs = getSwappableRefs("components/generic-text", catalog);
    const textarea = refs.find((r) => r.ref === "components/generic-textarea");
    expect(textarea?.displayName).toBe("Long text");
  });

  it.each([
    ["components/generic-date", "date"],
    ["components/generic-file", "file"],
    ["components/show-hide", "show-hide"],
  ])("returns [] for singleton type %s", (ref) => {
    expect(getSwappableRefs(ref, catalog)).toEqual([]);
  });

  it("returns [] for a block ref", () => {
    expect(getSwappableRefs("blocks/name", catalog)).toEqual([]);
  });

  it("returns [] for an unknown ref", () => {
    expect(getSwappableRefs("components/does-not-exist", catalog)).toEqual([]);
  });
});

describe("migrateOverridesForRef", () => {
  it("carries always-compatible keys across a text -> textarea swap", () => {
    const overrides: FieldOverrides = {
      fieldId: "my-field",
      label: "My Field",
      hint: "some hint",
      placeholder: "type here",
      isDisabled: true,
      isHidden: true,
      ui: { width: "short" },
      behaviours: [],
    };
    const result = migrateOverridesForRef(overrides, "text", "textarea");
    expect(result).toEqual(overrides);
  });

  it("keeps target-supported validation rules and drops unsupported ones (text -> textarea)", () => {
    const overrides: FieldOverrides = {
      validations: {
        required: { value: true },
        minLength: { value: 2 },
        maxLength: { value: 10 },
        pattern: { value: "[a-z]+" },
      },
    };
    const result = migrateOverridesForRef(overrides, "text", "textarea");
    // textarea supports required/minLength/maxLength but not pattern
    expect(result.validations).toEqual({
      required: { value: true },
      minLength: { value: 2 },
      maxLength: { value: 10 },
    });
  });

  it("drops numeric range rules when switching number -> text, keeping required", () => {
    const overrides: FieldOverrides = {
      validations: {
        required: { value: true },
        min: { value: 1 },
        max: { value: 100 },
      },
    };
    const result = migrateOverridesForRef(overrides, "number", "text");
    expect(result.validations).toEqual({ required: { value: true } });
  });

  it("always carries required and conditionalOn even when not in target descriptors", () => {
    const overrides: FieldOverrides = {
      validations: {
        required: { value: false },
        conditionalOn: { referenceFieldId: "other", value: "yes" },
      },
    };
    const result = migrateOverridesForRef(overrides, "text", "textarea");
    expect(result.validations).toEqual({
      required: { value: false },
      conditionalOn: { referenceFieldId: "other", value: "yes" },
    });
  });

  it("collapses validations to undefined when nothing survives", () => {
    const overrides: FieldOverrides = {
      validations: { pattern: { value: "[a-z]+" } },
    };
    const result = migrateOverridesForRef(overrides, "text", "textarea");
    expect(result.validations).toBeUndefined();
  });

  it("carries options but drops select-only `multiple` for a select -> radio swap", () => {
    const overrides: FieldOverrides = {
      options: [{ label: "A", value: "a" }],
      multiple: true,
    };
    const result = migrateOverridesForRef(overrides, "select", "radio");
    expect(result.options).toEqual([{ label: "A", value: "a" }]);
    // radio has no `multiple` property — it must not be carried.
    expect(result.multiple).toBeUndefined();
  });

  it("carries `multiple` when the target is a select (radio -> select)", () => {
    const overrides: FieldOverrides = {
      options: [{ label: "A", value: "a" }],
      multiple: true,
    };
    const result = migrateOverridesForRef(overrides, "radio", "select");
    expect(result.options).toEqual([{ label: "A", value: "a" }]);
    expect(result.multiple).toBe(true);
  });

  it("drops options and multiple when leaving the choice group (select -> text)", () => {
    const overrides: FieldOverrides = {
      options: [{ label: "A", value: "a" }],
      multiple: true,
      label: "Keep me",
    };
    const result = migrateOverridesForRef(overrides, "select", "text");
    expect(result.options).toBeUndefined();
    expect(result.multiple).toBeUndefined();
    expect(result.label).toBe("Keep me");
  });

  it("drops type-specific defaultValue and mask", () => {
    const overrides: FieldOverrides = {
      label: "Keep me",
      defaultValue: "x",
      mask: "999",
    };
    const result = migrateOverridesForRef(overrides, "text", "number");
    expect(result.defaultValue).toBeUndefined();
    expect(result.mask).toBeUndefined();
    expect(result.label).toBe("Keep me");
  });
});
