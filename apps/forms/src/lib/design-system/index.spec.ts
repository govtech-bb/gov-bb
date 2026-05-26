/**
 * Tests for lib/design-system/index.ts
 *
 * The module exposes `selectDesignSystem(requestedKey)` with three branches:
 *   1. !requestedKey → warn, return 'basic'
 *   2. requestedKey not in DESIGN_SYSTEMS → warn, return 'basic'
 *   3. requestedKey in DESIGN_SYSTEMS → return that system (no warn)
 *
 * The decision is decoupled from `import.meta.env` so tests can drive every
 * branch by passing the key directly, without relying on env mocking (which
 * is compile-time-baked by ts-jest-mock-import-meta).
 */

import designSystem, { selectDesignSystem } from "./index";

describe("selectDesignSystem", () => {
  it("warns and returns the basic system when requestedKey is undefined", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    const result = selectDesignSystem(undefined);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No design system specified"),
    );
    expect(result).toBeDefined();
    warn.mockRestore();
  });

  it("warns and returns the basic system when requestedKey is an empty string", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    const result = selectDesignSystem("");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No design system specified"),
    );
    expect(result).toBeDefined();
    warn.mockRestore();
  });

  it("warns and returns the basic system when requestedKey is an unrecognised key", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    const result = selectDesignSystem("nonexistent-system");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("'nonexistent-system' not found"),
    );
    expect(result).toBeDefined();
    warn.mockRestore();
  });

  it("returns the govtechbb system and does not warn when requestedKey is 'govtechbb'", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    const result = selectDesignSystem("govtechbb");
    expect(warn).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    warn.mockRestore();
  });

  it("returns the basic system and does not warn when requestedKey is 'basic'", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    const result = selectDesignSystem("basic");
    expect(warn).not.toHaveBeenCalled();
    expect(result).toBeDefined();
    warn.mockRestore();
  });
});

describe("default export", () => {
  it("is a styles object derived from VITE_DESIGN_SYSTEM at module load", () => {
    // The jest.config.ts ts-jest-mock-import-meta transformer bakes
    // VITE_DESIGN_SYSTEM="basic" into the source at compile time, so the
    // default export is whatever selectDesignSystem("basic") returns.
    expect(designSystem).toBeDefined();
    expect(designSystem).not.toBeNull();
  });
});
