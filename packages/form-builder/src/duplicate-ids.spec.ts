import {
  resolveFieldIds,
  findDuplicateFieldIds,
  findDuplicateStepIds,
  findRecipeIdCollisions,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  fieldIdDuplicatesAnother,
} from "./duplicate-ids";
import { getCatalog } from "./catalog";
import type { RegistryCatalog } from "./catalog";
import type { RecipeDraft, RecipeFieldDraft } from "./types";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBaseDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    formId: "form-001",
    title: "Test Form",
    steps: [],
    ...overrides,
  };
}

// Stamps a deterministic id on a field-draft fixture so tests needn't supply one.
let __idCounter = 0;
function f<T extends Omit<RecipeFieldDraft, "id">>(draft: T): RecipeFieldDraft {
  return { ...draft, id: `test-field-${++__idCounter}` };
}

// ─── resolveFieldIds ──────────────────────────────────────────────────────────

describe("resolveFieldIds", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  it("resolves a component field to its primitive default fieldId", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, catalog);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].fieldId).toBe("text");
    expect(resolved[0].stepId).toBe("step-1");
  });

  it("expands a block to one resolved id per child element", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, catalog);
    expect(resolved).toHaveLength(2);
    expect(resolved.map((r) => r.fieldId)).toEqual(["first-name", "last-name"]);
    expect(resolved[0].childFieldId).toBe("first-name");
    expect(resolved[1].childFieldId).toBe("last-name");
  });

  it("applies a block child override to the resolved child id", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: { "first-name": { fieldId: "given-name" } },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, catalog);
    expect(resolved.map((r) => r.fieldId)).toEqual(["given-name", "last-name"]);
    // childFieldId still keys the catalog child, not the override
    expect(resolved[0].childFieldId).toBe("first-name");
  });

  it("applies a component fieldId override over the primitive default", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/text",
              overrides: { fieldId: "custom-id" },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, catalog);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].fieldId).toBe("custom-id");
  });

  it("skips fields whose ref is unknown to the catalog without throwing", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/nonexistent",
              overrides: {},
            }),
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, catalog);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].fieldId).toBe("text");
  });

  it("skips a component whose primitive has no resolvable fieldId and no override", () => {
    const customCatalog: RegistryCatalog = {
      ...getCatalog(),
      custom: [
        {
          ref: "components/custom-no-id",
          displayName: "No Id Widget",
          namespace: "custom",
          type: "no-id-widget",
          definition: { fieldId: "", label: "No Id", htmlType: "text" },
        },
      ],
    };

    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "custom",
              ref: "components/custom-no-id",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, customCatalog);
    expect(resolved).toHaveLength(0);
  });

  it("resolves a custom component default id via the catalog primitive", () => {
    const customCatalog: RegistryCatalog = {
      ...getCatalog(),
      custom: [
        {
          ref: "components/custom-my-widget",
          displayName: "My Widget",
          namespace: "custom",
          type: "my-widget",
          definition: {
            fieldId: "my-widget",
            label: "My Widget",
            htmlType: "text",
          },
        },
      ],
    };

    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "custom",
              ref: "components/custom-my-widget",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const resolved = resolveFieldIds(draft, customCatalog);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].fieldId).toBe("my-widget");
  });
});

// ─── findDuplicateFieldIds ────────────────────────────────────────────────────

describe("findDuplicateFieldIds", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  it("flags two same-component fields with blank overrides as a collision on the default id", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const collisions = findDuplicateFieldIds(draft, catalog);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].id).toBe("text");
    expect(collisions[0].locations).toHaveLength(2);
  });

  it("flags a hand-typed override duplicating another field's default id", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
            f({
              kind: "component",
              ref: "components/email",
              overrides: { fieldId: "text" },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const collisions = findDuplicateFieldIds(draft, catalog);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].id).toBe("text");
    expect(collisions[0].locations).toHaveLength(2);
  });

  it("flags two blocks of the same ref colliding on each child id", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: {},
            }),
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const collisions = findDuplicateFieldIds(draft, catalog);
    const ids = collisions.map((c) => c.id).sort();
    expect(ids).toEqual(["first-name", "last-name"]);
    for (const c of collisions) {
      expect(c.locations).toHaveLength(2);
    }
  });

  it("flags a block child id colliding with a top-level field id", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/text",
              overrides: { fieldId: "first-name" },
            }),
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const collisions = findDuplicateFieldIds(draft, catalog);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].id).toBe("first-name");
    expect(collisions[0].locations).toHaveLength(2);
  });

  it("detects collisions across different steps (recipe-wide)", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
        {
          stepId: "step-2",
          title: "Step 2",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const collisions = findDuplicateFieldIds(draft, catalog);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].id).toBe("text");
  });

  it("returns no collisions for a clean recipe", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
            f({ kind: "component", ref: "components/email", overrides: {} }),
            f({
              kind: "block",
              ref: "blocks/name",
              overrides: {},
              childOverrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    expect(findDuplicateFieldIds(draft, catalog)).toEqual([]);
  });
});

// ─── findDuplicateStepIds ─────────────────────────────────────────────────────

describe("findDuplicateStepIds", () => {
  it("flags two steps sharing a stepId", () => {
    const draft = makeBaseDraft({
      steps: [
        { stepId: "step-1", title: "One", fields: [], behaviours: [] },
        { stepId: "step-1", title: "Two", fields: [], behaviours: [] },
      ],
    });

    const collisions = findDuplicateStepIds(draft);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].stepId).toBe("step-1");
    expect(collisions[0].locations).toHaveLength(2);
  });

  it("ignores blank/empty stepIds", () => {
    const draft = makeBaseDraft({
      steps: [
        { stepId: "", title: "One", fields: [], behaviours: [] },
        { stepId: "   ", title: "Two", fields: [], behaviours: [] },
        { stepId: "", title: "Three", fields: [], behaviours: [] },
      ],
    });

    expect(findDuplicateStepIds(draft)).toEqual([]);
  });

  it("returns no collisions when all stepIds are unique", () => {
    const draft = makeBaseDraft({
      steps: [
        { stepId: "step-1", title: "One", fields: [], behaviours: [] },
        { stepId: "step-2", title: "Two", fields: [], behaviours: [] },
      ],
    });

    expect(findDuplicateStepIds(draft)).toEqual([]);
  });
});

// ─── findRecipeIdCollisions ───────────────────────────────────────────────────

describe("findRecipeIdCollisions", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  it("returns both field-id and step-id collisions together", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "dup-step",
          title: "One",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
        { stepId: "dup-step", title: "Two", fields: [], behaviours: [] },
      ],
    });

    const result = findRecipeIdCollisions(draft, catalog);
    expect(result.fieldIdCollisions).toHaveLength(1);
    expect(result.fieldIdCollisions[0].id).toBe("text");
    expect(result.stepIdCollisions).toHaveLength(1);
    expect(result.stepIdCollisions[0].stepId).toBe("dup-step");
  });

  it("returns empty arrays for a clean recipe", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "One",
          fields: [
            f({ kind: "component", ref: "components/text", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const result = findRecipeIdCollisions(draft, catalog);
    expect(result.fieldIdCollisions).toEqual([]);
    expect(result.stepIdCollisions).toEqual([]);
  });
});

// ─── fieldIdDuplicatesAnother ─────────────────────────────────────────────────

describe("fieldIdDuplicatesAnother", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  function twoFieldDraft(): RecipeDraft {
    return makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            {
              id: "editor-A",
              kind: "component",
              ref: "components/text",
              overrides: {},
            },
            {
              id: "editor-B",
              kind: "component",
              ref: "components/email",
              overrides: {},
            },
          ],
          behaviours: [],
        },
      ],
    });
  }

  it("returns true when candidate matches another field's resolved id", () => {
    const draft = twoFieldDraft();
    // editing field B, typing "text" which is field A's id
    expect(fieldIdDuplicatesAnother(draft, catalog, "editor-B", "text")).toBe(
      true,
    );
  });

  it("returns false when candidate matches only the field being edited", () => {
    const draft = twoFieldDraft();
    // editing field A whose own resolved id is "text"
    expect(fieldIdDuplicatesAnother(draft, catalog, "editor-A", "text")).toBe(
      false,
    );
  });

  it("returns false for a blank candidate id", () => {
    const draft = twoFieldDraft();
    expect(fieldIdDuplicatesAnother(draft, catalog, "editor-B", "")).toBe(
      false,
    );
    expect(fieldIdDuplicatesAnother(draft, catalog, "editor-B", "   ")).toBe(
      false,
    );
  });

  it("returns false when candidate matches no field at all", () => {
    const draft = twoFieldDraft();
    expect(fieldIdDuplicatesAnother(draft, catalog, "editor-B", "nope")).toBe(
      false,
    );
  });
});

// ─── findRecipeIdCollisionsFromRecipe ─────────────────────────────────────────

describe("findRecipeIdCollisionsFromRecipe", () => {
  let catalog: RegistryCatalog;

  beforeEach(() => {
    catalog = getCatalog();
  });

  // Builds a persisted-format recipe (ServiceContractRecipe shape) so the
  // wrapper is exercised on the same input the server routes hold.
  function makeRecipe(
    steps: ServiceContractRecipe["steps"],
  ): ServiceContractRecipe {
    return {
      formId: "form-001",
      title: "Test Form",
      steps,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: "1.0.0",
    };
  }

  it("flags two same-component elements with blank overrides on the default id", () => {
    const recipe = makeRecipe([
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "components/text" }, { ref: "components/text" }],
      },
    ]);

    const result = findRecipeIdCollisionsFromRecipe(recipe, catalog);
    expect(result.fieldIdCollisions).toHaveLength(1);
    expect(result.fieldIdCollisions[0].id).toBe("text");
    expect(result.fieldIdCollisions[0].locations).toHaveLength(2);
    expect(result.stepIdCollisions).toEqual([]);
  });

  it("flags two same-ref blocks colliding on each child id", () => {
    const recipe = makeRecipe([
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [{ ref: "blocks/name" }, { ref: "blocks/name" }],
      },
    ]);

    const result = findRecipeIdCollisionsFromRecipe(recipe, catalog);
    const ids = result.fieldIdCollisions.map((c) => c.id).sort();
    expect(ids).toEqual(["first-name", "last-name"]);
  });

  it("flags a block child id colliding with a top-level element", () => {
    const recipe = makeRecipe([
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [
          { ref: "components/text", overrides: { fieldId: "first-name" } },
          { ref: "blocks/name" },
        ],
      },
    ]);

    const result = findRecipeIdCollisionsFromRecipe(recipe, catalog);
    expect(result.fieldIdCollisions).toHaveLength(1);
    expect(result.fieldIdCollisions[0].id).toBe("first-name");
  });

  it("flags duplicate stepIds across the recipe", () => {
    const recipe = makeRecipe([
      { stepId: "dup", title: "One", elements: [] },
      { stepId: "dup", title: "Two", elements: [] },
    ]);

    const result = findRecipeIdCollisionsFromRecipe(recipe, catalog);
    expect(result.fieldIdCollisions).toEqual([]);
    expect(result.stepIdCollisions).toHaveLength(1);
    expect(result.stepIdCollisions[0].stepId).toBe("dup");
  });

  it("returns no collisions for a clean recipe", () => {
    const recipe = makeRecipe([
      {
        stepId: "step-1",
        title: "Step 1",
        elements: [
          { ref: "components/text" },
          { ref: "components/email" },
          { ref: "blocks/name" },
        ],
      },
    ]);

    const result = findRecipeIdCollisionsFromRecipe(recipe, catalog);
    expect(result.fieldIdCollisions).toEqual([]);
    expect(result.stepIdCollisions).toEqual([]);
  });

  it("returns no collisions (and does not throw) for a structurally malformed recipe", () => {
    const malformed = {
      formId: "x",
      title: "X",
    } as unknown as ServiceContractRecipe;
    const result = findRecipeIdCollisionsFromRecipe(malformed, catalog);
    expect(result.fieldIdCollisions).toEqual([]);
    expect(result.stepIdCollisions).toEqual([]);
  });
});

// ─── formatCollisionIssues ────────────────────────────────────────────────────

describe("formatCollisionIssues", () => {
  it("formats a fieldId collision into a ValidationIssue with the UI's strings", () => {
    const issues = formatCollisionIssues({
      fieldIdCollisions: [
        {
          id: "text",
          locations: [
            {
              fieldId: "text",
              editorFieldId: "a",
              stepId: "step-1",
              stepTitle: "Personal details",
              display: "Text",
            },
            {
              fieldId: "text",
              editorFieldId: "b",
              stepId: "step-1",
              stepTitle: "Personal details",
              display: "Text",
            },
          ],
        },
      ],
      stepIdCollisions: [],
    });

    expect(issues).toEqual([
      {
        path: "fieldId:text",
        message:
          'Field ID "text" is used by 2 fields: Personal details › Text; Personal details › Text.',
      },
    ]);
  });

  it("formats a stepId collision into a ValidationIssue with the UI's strings", () => {
    const issues = formatCollisionIssues({
      fieldIdCollisions: [],
      stepIdCollisions: [
        {
          stepId: "dup",
          locations: [
            { stepId: "dup", stepTitle: "One", stepIndex: 0 },
            { stepId: "dup", stepTitle: "Two", stepIndex: 1 },
          ],
        },
      ],
    });

    expect(issues).toEqual([
      {
        path: "stepId:dup",
        message: 'Step ID "dup" is used by 2 steps: One; Two.',
      },
    ]);
  });

  it("falls back to stepId when a location has no stepTitle", () => {
    const issues = formatCollisionIssues({
      fieldIdCollisions: [],
      stepIdCollisions: [
        {
          stepId: "dup",
          locations: [
            { stepId: "dup", stepTitle: "", stepIndex: 0 },
            { stepId: "dup", stepTitle: "", stepIndex: 1 },
          ],
        },
      ],
    });

    expect(issues[0].message).toBe(
      'Step ID "dup" is used by 2 steps: dup; dup.',
    );
  });

  it("returns an empty array when there are no collisions", () => {
    expect(
      formatCollisionIssues({ fieldIdCollisions: [], stepIdCollisions: [] }),
    ).toEqual([]);
  });
});
