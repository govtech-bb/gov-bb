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
});
