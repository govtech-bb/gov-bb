import {
  BUILTIN_REGISTRY,
  REGISTRY_BLOCKS,
  REGISTRY_COMPONENTS,
} from "./index";

describe("BUILTIN_REGISTRY", () => {
  it("merges every component and block entry into one map", () => {
    expect(BUILTIN_REGISTRY).toEqual({
      ...REGISTRY_COMPONENTS,
      ...REGISTRY_BLOCKS,
    });
  });

  it("exposes each component under its components/ ref", () => {
    for (const [ref, entry] of Object.entries(REGISTRY_COMPONENTS)) {
      expect(BUILTIN_REGISTRY[ref]).toBe(entry);
    }
    expect(BUILTIN_REGISTRY["components/first-name"]).toBeDefined();
  });

  it("exposes each block under its blocks/ ref", () => {
    for (const [ref, entry] of Object.entries(REGISTRY_BLOCKS)) {
      expect(BUILTIN_REGISTRY[ref]).toBe(entry);
    }
    expect(BUILTIN_REGISTRY["blocks/personal-information"]).toBeDefined();
  });

  it("has one entry per component plus block (no key collisions)", () => {
    expect(Object.keys(BUILTIN_REGISTRY)).toHaveLength(
      Object.keys(REGISTRY_COMPONENTS).length +
        Object.keys(REGISTRY_BLOCKS).length,
    );
  });

  it("exposes the primary-school select with all 70 schools", () => {
    const primarySchool = BUILTIN_REGISTRY["components/primary-school"];
    expect(primarySchool).toMatchObject({
      fieldId: "primary-school",
      label: "Primary School",
      htmlType: "select",
      multiple: false,
    });
    if (!("options" in primarySchool)) {
      throw new Error("primary-school must define options");
    }
    expect(primarySchool.options).toHaveLength(70);
    expect(primarySchool.options?.[0]).toEqual({
      label: "A Dacosta Edwards",
      value: "a-dacosta-edwards",
    });
    expect(primarySchool.options?.at(-1)).toEqual({
      label: "Workman's Primary",
      value: "workmans-primary",
    });
  });
});
