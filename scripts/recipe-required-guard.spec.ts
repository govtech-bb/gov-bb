// scripts/recipe-required-guard.spec.ts
import {
  findRequiredGuardViolations,
  type RecipeFileChange,
  type RecipeLike,
} from "./recipe-required-guard";

const PATH = "apps/api/src/forms/form-definitions/recipes/x/1.0.0.json";

/** A `components/generic-*` element with an explicit fieldId and optional extra overrides. */
const generic = (
  fieldId: string,
  overrides: Record<string, unknown> = {},
  ref = "components/generic-text",
) => ({ ref, overrides: { fieldId, ...overrides } });

const required = (value: boolean) => ({
  validations: { required: { value, error: "x" } },
});

const step = (stepId: string, elements: unknown[]) => ({ stepId, elements });
const recipe = (...steps: unknown[]): RecipeLike => ({ steps }) as RecipeLike;

const change = (
  headJson: RecipeLike,
  baseJson: RecipeLike | null = null,
): RecipeFileChange => ({ path: PATH, baseJson, headJson });

describe("findRequiredGuardViolations", () => {
  it("flags an added generic field with no validations (implicitly required)", () => {
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(recipe(step("s1", [generic("other-names")])))],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(PATH);
    expect(violations[0]).toContain("other-names");
    expect(violations[0]).toMatch(/required\.value/);
  });

  it("passes an added generic field with explicit required:true", () => {
    expect(
      findRequiredGuardViolations({
        recipeFiles: [
          change(recipe(step("s1", [generic("nis", required(true))]))),
        ],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("passes an added generic field with explicit required:false", () => {
    expect(
      findRequiredGuardViolations({
        recipeFiles: [
          change(recipe(step("s1", [generic("nis", required(false))]))),
        ],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("does NOT flag a pre-existing implicitly-required field that is unchanged (grandfathered)", () => {
    const head = recipe(step("s1", [generic("legacy")]));
    const base = recipe(step("s1", [generic("legacy")]));
    expect(
      findRequiredGuardViolations({
        recipeFiles: [change(head, base)],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("flags a pre-existing field that is MODIFIED but still has no explicit required", () => {
    const base = recipe(step("s1", [generic("legacy", { label: "Old" })]));
    const head = recipe(step("s1", [generic("legacy", { label: "New" })]));
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(head, base)],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("legacy");
  });

  it("flags a brand-new field added to an existing (otherwise unchanged) step", () => {
    const base = recipe(step("s1", [generic("kept")]));
    const head = recipe(step("s1", [generic("kept"), generic("added")]));
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(head, base)],
      hasOverrideLabel: false,
    });
    // Only the newly-added field is flagged; the unchanged one is grandfathered.
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("added");
    expect(violations[0]).not.toContain("kept");
  });

  it("ignores non-generic component refs and block refs", () => {
    const head = recipe(
      step("s1", [
        generic("nm", {}, "components/name"),
        { ref: "blocks/address", overrides: {} },
      ]),
    );
    expect(
      findRequiredGuardViolations({
        recipeFiles: [change(head)],
        hasOverrideLabel: false,
      }),
    ).toEqual([]);
  });

  it("skips all checks when the override label is present", () => {
    expect(
      findRequiredGuardViolations({
        recipeFiles: [change(recipe(step("s1", [generic("x")])))],
        hasOverrideLabel: true,
      }),
    ).toEqual([]);
  });

  it("flags a field that overrides OTHER validations but omits required (shallow-merge trap)", () => {
    const head = recipe(
      step("s1", [
        generic("notes", {
          validations: { minLength: { value: 2, error: "too short" } },
        }),
      ]),
    );
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(head)],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("notes");
  });

  it("treats every generic field in a newly-added recipe file (null base) as in scope", () => {
    const head = recipe(
      step("s1", [generic("a", required(true)), generic("b")]),
    );
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(head, null)],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('"b"');
  });

  it("matches all 10 generic-* primitive refs", () => {
    const refs = [
      "components/generic-text",
      "components/generic-textarea",
      "components/generic-tel",
      "components/generic-email",
      "components/generic-number",
      "components/generic-date",
      "components/generic-radio",
      "components/generic-checkbox",
      "components/generic-select",
      "components/generic-file",
    ];
    const head = recipe(
      step(
        "s1",
        refs.map((ref, i) => generic(`f${i}`, {}, ref)),
      ),
    );
    const violations = findRequiredGuardViolations({
      recipeFiles: [change(head)],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(refs.length);
  });

  it("aggregates violations across multiple changed files", () => {
    const fileA = change(recipe(step("s1", [generic("a")])));
    const fileB: RecipeFileChange = {
      path: "apps/api/src/forms/form-definitions/recipes/y/2.0.0.json",
      baseJson: null,
      headJson: recipe(step("s1", [generic("b")])),
    };
    const violations = findRequiredGuardViolations({
      recipeFiles: [fileA, fileB],
      hasOverrideLabel: false,
    });
    expect(violations).toHaveLength(2);
  });
});
