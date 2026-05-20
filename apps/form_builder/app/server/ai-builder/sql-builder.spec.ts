import { buildSql } from "./sql-builder";

describe("buildSql", () => {
  it("renders INSERT INTO form_definitions with the recipe as a JSON literal", () => {
    const recipe = { formId: "my-form", steps: [], version: "1.0.0" };
    const sql = buildSql("my-form", recipe);
    expect(sql).toContain("INSERT INTO form_definitions");
    expect(sql).toContain("'my-form'");
    expect(sql).toContain("$recipe$");
    expect(sql).toContain('"formId": "my-form"');
  });

  it("formats the recipe JSON with 2-space indentation", () => {
    const recipe = { formId: "f", steps: [{ stepId: "s1" }] };
    const sql = buildSql("f", recipe);
    expect(sql).toContain('  "formId": "f"');
    expect(sql).toContain('    "stepId": "s1"');
  });

  it("escapes formId by interpolation (current behavior — caller passes trusted slug)", () => {
    const sql = buildSql("trusted-slug", { formId: "trusted-slug", steps: [] });
    expect(sql).toContain("'trusted-slug'");
  });
});
