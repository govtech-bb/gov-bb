import { serializeRecipeDraft, deserializeRecipe } from "./serialization";
import { getCatalog } from "./catalog";
import type { RegistryCatalog } from "./catalog";
import type { RecipeDraft, RecipeFieldDraft } from "./types";

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

// ─── serializeRecipeDraft / deserializeRecipe round-trip ───────────────────

describe("serializeRecipeDraft + deserializeRecipe round-trip", () => {
  it("preserves formId and title", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.formId).toBe(draft.formId);
    expect(result.title).toBe(draft.title);
  });

  it("omits description when not present on draft", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(recipe.description).toBeUndefined();
    const result = deserializeRecipe(recipe);
    expect(result.description).toBeUndefined();
  });

  it("preserves description on the draft when present", () => {
    const draft = makeBaseDraft({ description: "A useful form" });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(recipe.description).toBe("A useful form");
    const result = deserializeRecipe(recipe);
    expect(result.description).toBe("A useful form");
  });

  it("does not assert exact createdAt/updatedAt — only that they are strings", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(typeof recipe.createdAt).toBe("string");
    expect(typeof recipe.updatedAt).toBe("string");
  });

  it("processors are not set in serialize output", () => {
    const draft = makeBaseDraft();
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });

    expect(recipe.processors).toBeUndefined();
  });

  it("empty steps array survives round-trip", () => {
    const draft = makeBaseDraft({ steps: [] });
    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps).toEqual([]);
  });

  it("component field (kind: 'component') survives round-trip without overrides", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/text",
              overrides: {},
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].elements[0].ref).toBe("components/text");
    expect(recipe.steps[0].elements[0].overrides).toBeUndefined();

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].fields[0].kind).toBe("component");
    expect(result.steps[0].fields[0].ref).toBe("components/text");
    expect(result.steps[0].fields[0].overrides).toEqual({});
  });

  it("component field with overrides (label, hint, isDisabled, validations.required) survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/email",
              overrides: {
                label: "Your Email",
                hint: "Work address preferred",
                isDisabled: true,
                validations: { required: { error: "This field is required" } },
              },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.ref).toBe("components/email");
    expect(element.overrides).toEqual({
      label: "Your Email",
      hint: "Work address preferred",
      isDisabled: true,
      validations: { required: { error: "This field is required" } },
    });

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("component");
    expect(field.overrides).toEqual({
      label: "Your Email",
      hint: "Work address preferred",
      isDisabled: true,
      validations: { required: { error: "This field is required" } },
    });
  });

  it("block field (kind: 'block') survives round-trip without child overrides", () => {
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

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.ref).toBe("blocks/name");
    expect(element.overrides).toBeUndefined();

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("block");
    expect(field.ref).toBe("blocks/name");
    expect(field.childOverrides).toEqual({});
    expect(field.overrides).toEqual({});
  });

  it("block field with child overrides survives round-trip", () => {
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
              childOverrides: {
                "first-name": { label: "Given Name" },
                "last-name": { label: "Family Name", isDisabled: true },
              },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0];
    expect(element.overrides).toEqual({
      "first-name": { label: "Given Name" },
      "last-name": { label: "Family Name", isDisabled: true },
    });

    const result = deserializeRecipe(recipe);
    const field = result.steps[0].fields[0];
    expect(field.kind).toBe("block");
    expect(field.childOverrides).toEqual({
      "first-name": { label: "Given Name" },
      "last-name": { label: "Family Name", isDisabled: true },
    });
  });

  it("custom field requires catalog to detect kind — without catalog it becomes 'component'", () => {
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

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].elements[0].ref).toBe("components/custom-my-widget");

    // Without catalog: kind falls back to "component"
    const resultWithoutCatalog = deserializeRecipe(recipe);
    expect(resultWithoutCatalog.steps[0].fields[0].kind).toBe("component");

    // With catalog: kind is correctly detected as "custom"
    const resultWithCatalog = deserializeRecipe(recipe, customCatalog);
    expect(resultWithCatalog.steps[0].fields[0].kind).toBe("custom");
    expect(resultWithCatalog.steps[0].fields[0].ref).toBe(
      "components/custom-my-widget",
    );
  });

  it("description on a step survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          description: "Fill in your personal details",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].description).toBe("Fill in your personal details");

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].description).toBe("Fill in your personal details");
  });

  it("absent description on a step is not forwarded", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].description).toBeUndefined();

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].description).toBeUndefined();
  });

  it("behaviours on steps survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
          behaviours: [
            {
              type: "stepConditionalOn",
              targetFieldId: "status",
              targetStepId: "step-0",
              operator: "equal",
              value: "active",
            },
          ],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    expect(recipe.steps[0].behaviours).toEqual([
      {
        type: "stepConditionalOn",
        targetFieldId: "status",
        targetStepId: "step-0",
        operator: "equal",
        value: "active",
      },
    ]);

    const result = deserializeRecipe(recipe);
    expect(result.steps[0].behaviours).toEqual([
      {
        type: "stepConditionalOn",
        targetFieldId: "status",
        targetStepId: "step-0",
        operator: "equal",
        value: "active",
      },
    ]);
  });

  it("empty behaviours array on step survives round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);
    expect(result.steps[0].behaviours).toEqual([]);
  });

  it("multiple steps with mixed fields survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Personal",
          fields: [
            f({
              kind: "component",
              ref: "components/text",
              overrides: { label: "Full Name" },
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
        {
          stepId: "step-2",
          title: "Contact",
          fields: [
            f({ kind: "component", ref: "components/email", overrides: {} }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].fields[0].ref).toBe("components/text");
    expect(result.steps[0].fields[0].overrides).toEqual({ label: "Full Name" });
    expect(result.steps[0].fields[1].kind).toBe("block");
    expect(result.steps[1].fields[0].ref).toBe("components/email");
  });

  it("deserializeRecipe stamps a unique editor-only id on every field", () => {
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

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    const [a, b] = result.steps[0].fields;
    expect(typeof a.id).toBe("string");
    expect(typeof b.id).toBe("string");
    expect(a.id).not.toBe(b.id);
  });

  it("serializeRecipeDraft does not emit the editor-only id on the wire", () => {
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

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const element = recipe.steps[0].elements[0] as Record<string, unknown>;
    expect(element.id).toBeUndefined();
    expect(Object.keys(element)).not.toContain("id");
  });

  it("field-level overrides with only validations.required survive round-trip", () => {
    const draft = makeBaseDraft({
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          fields: [
            f({
              kind: "component",
              ref: "components/text",
              overrides: { validations: { required: {} } },
            }),
          ],
          behaviours: [],
        },
      ],
    });

    const recipe = serializeRecipeDraft(draft, { version: "1.0.0" });
    const result = deserializeRecipe(recipe);

    expect(result.steps[0].fields[0].overrides).toEqual({
      validations: { required: {} },
    });
  });
});
