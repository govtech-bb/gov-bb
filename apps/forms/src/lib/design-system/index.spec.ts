/**
 * Tests for lib/design-system/index.ts
 *
 * The module has three conditional branches:
 *   1. !requestedKey → warn, default to 'basic'
 *   2. requestedKey not in DESIGN_SYSTEMS → warn, default to 'basic'
 *   3. requestedKey in DESIGN_SYSTEMS → use that system (no warn)
 *
 * Module-level side-effects require jest.isolateModules() to re-evaluate
 * the module for each env-var scenario.
 */

afterEach(() => {
  jest.resetModules();
});

describe("design-system/index", () => {
  it("warns and defaults to basic when VITE_DESIGN_SYSTEM is not set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      (import.meta as any).env = {
        ...import.meta.env,
        VITE_DESIGN_SYSTEM: undefined,
      };
      require("./index");
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No design system specified"),
    );
    warn.mockRestore();
  });

  it("warns and defaults to basic when VITE_DESIGN_SYSTEM is an unrecognised key", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      (import.meta as any).env = {
        ...import.meta.env,
        VITE_DESIGN_SYSTEM: "nonexistent-system",
      };
      require("./index");
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
    warn.mockRestore();
  });

  it("uses the specified design system and does not warn when VITE_DESIGN_SYSTEM='govtechbb'", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      (import.meta as any).env = {
        ...import.meta.env,
        VITE_DESIGN_SYSTEM: "govtechbb",
      };
      require("./index");
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("exports a design-system object", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation();
    let ds: unknown;
    jest.isolateModules(() => {
      ds = require("./index").default;
    });
    expect(ds).toBeDefined();
    warn.mockRestore();
  });
});
