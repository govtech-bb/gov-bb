import type {
  ServiceContractRecipe,
  RecipeFormStep,
  RecipeFormStepField,
  FieldOverrides,
} from "@govtech-bb/form-types";
import type { RecipeDraft, RecipeStepDraft, RecipeFieldDraft } from "./types";
import type { RegistryCatalog } from "./catalog";

/**
 * Serialize a RecipeDraft (UI state) into a ServiceContractRecipe (persisted format).
 */
export function serializeRecipeDraft(
  draft: RecipeDraft,
  opts: { version: string },
): ServiceContractRecipe {
  const now = new Date().toISOString();

  const steps: RecipeFormStep[] = draft.steps.map(
    (stepDraft: RecipeStepDraft) => {
      const elements: RecipeFormStepField[] = stepDraft.fields.map(
        (field: RecipeFieldDraft): RecipeFormStepField => {
          if (field.kind === "block") {
            const hasChildOverrides =
              field.childOverrides &&
              Object.keys(field.childOverrides).length > 0;
            return {
              ref: field.ref as `blocks/${string}`,
              ...(hasChildOverrides
                ? {
                    overrides: field.childOverrides as Record<
                      string,
                      FieldOverrides
                    >,
                  }
                : {}),
            };
          } else {
            // "component" | "custom"
            const hasOverrides =
              field.overrides && Object.keys(field.overrides).length > 0;
            return {
              ref: field.ref as `components/${string}`,
              ...(hasOverrides ? { overrides: field.overrides } : {}),
            };
          }
        },
      );

      const step: RecipeFormStep = {
        stepId: stepDraft.stepId,
        title: stepDraft.title,
        ...(stepDraft.description !== undefined
          ? { description: stepDraft.description }
          : {}),
        elements,
        behaviours: stepDraft.behaviours,
      };

      return step;
    },
  );

  return {
    formId: draft.formId,
    title: draft.title,
    ...(draft.description !== undefined
      ? { description: draft.description }
      : {}),
    version: opts.version,
    // processors are managed outside the builder (e.g. by the API); never set here
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deserialize a ServiceContractRecipe (persisted format) into a RecipeDraft (UI state).
 */
export function deserializeRecipe(
  recipe: ServiceContractRecipe,
  catalog?: RegistryCatalog,
): RecipeDraft {
  const steps: RecipeStepDraft[] = recipe.steps.map(
    (recipeStep: RecipeFormStep): RecipeStepDraft => {
      const fields: RecipeFieldDraft[] = (recipeStep.elements ?? []).map(
        (field: RecipeFormStepField): RecipeFieldDraft => {
          const isCustom =
            catalog?.custom.some((c) => c.ref === field.ref) ?? false;
          const kind: RecipeFieldDraft["kind"] = field.ref.startsWith("blocks/")
            ? "block"
            : isCustom
              ? "custom"
              : "component";

          // Editor-only id; two same-ref entries on a step would otherwise be indistinguishable.
          const id = crypto.randomUUID();

          if (kind === "block") {
            return {
              id,
              kind: "block",
              ref: field.ref,
              overrides: {},
              childOverrides:
                (
                  field as {
                    ref: string;
                    overrides?: Record<string, FieldOverrides>;
                  }
                ).overrides ?? {},
            };
          } else {
            return {
              id,
              kind,
              ref: field.ref,
              overrides:
                (field as { ref: string; overrides?: FieldOverrides })
                  .overrides ?? {},
            };
          }
        },
      );

      return {
        stepId: recipeStep.stepId,
        title: recipeStep.title,
        ...(recipeStep.description !== undefined
          ? { description: recipeStep.description }
          : {}),
        fields,
        behaviours: recipeStep.behaviours ?? [],
      };
    },
  );

  return {
    formId: recipe.formId,
    title: recipe.title,
    ...(recipe.description !== undefined
      ? { description: recipe.description }
      : {}),
    steps,
  };
}
