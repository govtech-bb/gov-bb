import { canonicalizeRecipe } from "./canonical-recipe";

describe("canonicalizeRecipe", () => {
  it("sorts object keys alphabetically", () => {
    const out = canonicalizeRecipe({ b: 1, a: 2 });
    expect(out).toBe('{\n  "a": 2,\n  "b": 1\n}\n');
  });

  it("sorts keys at every nesting level", () => {
    const out = canonicalizeRecipe({ outer: { z: 1, a: 2 }, prelude: true });
    expect(out).toBe(
      '{\n  "outer": {\n    "a": 2,\n    "z": 1\n  },\n  "prelude": true\n}\n',
    );
  });

  it("preserves array order", () => {
    const out = canonicalizeRecipe({ items: [3, 1, 2] });
    expect(out).toBe('{\n  "items": [\n    3,\n    1,\n    2\n  ]\n}\n');
  });

  it("sorts keys within objects nested inside arrays", () => {
    const out = canonicalizeRecipe({ items: [{ b: 1, a: 2 }] });
    expect(out).toBe(
      '{\n  "items": [\n    {\n      "a": 2,\n      "b": 1\n    }\n  ]\n}\n',
    );
  });

  it("emits a trailing newline", () => {
    const out = canonicalizeRecipe({ a: 1 });
    expect(out.endsWith("\n")).toBe(true);
  });

  it("is idempotent", () => {
    const first = canonicalizeRecipe({ b: 1, a: { z: 1, b: 2 } });
    const second = canonicalizeRecipe(JSON.parse(first));
    expect(second).toBe(first);
  });

  it("passes primitives through unchanged", () => {
    expect(canonicalizeRecipe("hello")).toBe('"hello"\n');
    expect(canonicalizeRecipe(42)).toBe("42\n");
    expect(canonicalizeRecipe(null)).toBe("null\n");
  });
});
