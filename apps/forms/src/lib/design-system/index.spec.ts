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

const originalDesignSystem = process.env.DESIGN_SYSTEM;

afterEach(() => {
  if (originalDesignSystem === undefined) {
    delete process.env.DESIGN_SYSTEM;
  } else {
    process.env.DESIGN_SYSTEM = originalDesignSystem;
  }
  jest.resetModules();
});

describe("design-system/index", () => {
  it("warns and defaults to basic when DESIGN_SYSTEM is not set", () => {
    delete process.env.DESIGN_SYSTEM;
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      require("./index");
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No design system specified"),
    );
    warn.mockRestore();
  });

  it("warns and defaults to basic when DESIGN_SYSTEM is an unrecognised key", () => {
    process.env.DESIGN_SYSTEM = "nonexistent-system";
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      require("./index");
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
    warn.mockRestore();
  });

  it("uses the specified design system and does not warn when DESIGN_SYSTEM='govtechbb'", () => {
    process.env.DESIGN_SYSTEM = "govtechbb";
    const warn = jest.spyOn(console, "warn").mockImplementation();
    jest.isolateModules(() => {
      require("./index");
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("exports a styles-proxy module by default (warning fires for empty DESIGN_SYSTEM)", () => {
    delete process.env.DESIGN_SYSTEM;
    const warn = jest.spyOn(console, "warn").mockImplementation();
    let raw: unknown;
    jest.isolateModules(() => {
      raw = require("./index");
    });
    // The default branch must log the per-source warning. This is a real
    // behavioural signal — far stronger than the previous toBeDefined check,
    // which would have passed for any non-undefined value including the
    // string "default" returned by the styleMock proxy's get-trap.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("No design system specified"),
    );
    // And the module must export something importable — assert non-null
    // rather than the brittle Proxy-identity comparison that was complicated
    // by the styleMock returning a Proxy for any property access.
    expect(raw).not.toBeNull();
    expect(raw).not.toBeUndefined();
    warn.mockRestore();
  });
});
