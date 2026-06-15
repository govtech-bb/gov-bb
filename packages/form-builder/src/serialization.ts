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
        // Confirmation-step content (#1292). `!== undefined` keeps "absent"
        // distinct from an explicit empty string/array. markdownContent is
        // editable in the builder; nextSteps is carried through untouched.
        ...(stepDraft.markdownContent !== undefined
          ? { markdownContent: stepDraft.markdownContent }
          : {}),
        ...(stepDraft.nextSteps !== undefined
          ? { nextSteps: stepDraft.nextSteps }
          : {}),
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
    // Carry contact details through (issue #452). `!== undefined` keeps an
    // explicitly-set object distinct from "absent" — same guard as processors.
    ...(draft.contactDetails !== undefined
      ? { contactDetails: draft.contactDetails }
      : {}),
    version: opts.version,
    // Carry processors through, stripping the editor-only id (never persisted,
    // per ADR 0009) AND every `payment` processor: payment config is now a
    // per-environment DB sibling living in `form_config.config` (#716, ADR
    // 0033), never in the committed recipe — so it must never reach the wire
    // here. `!== undefined` (not a truthiness/length check) keeps "absent"
    // distinct from an explicit `[]`. The filter can collapse a non-empty draft
    // array to `[]` (a form whose only processor was payment) — that's the
    // correct wire shape, and the editor still holds the payment entry to send
    // in the DB sibling field.
    ...(draft.processors !== undefined
      ? {
          processors: draft.processors
            .filter((p) => p.type !== "payment")
            .map(({ id: _id, ...rest }) => rest),
        }
      : {}),
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
        // Symmetric read so confirmation content survives an open → deploy
        // cycle (#1292) — mirrors the serialize guard above.
        ...(recipeStep.markdownContent !== undefined
          ? { markdownContent: recipeStep.markdownContent }
          : {}),
        ...(recipeStep.nextSteps !== undefined
          ? { nextSteps: recipeStep.nextSteps }
          : {}),
      };
    },
  );

  return {
    formId: recipe.formId,
    title: recipe.title,
    ...(recipe.description !== undefined
      ? { description: recipe.description }
      : {}),
    // Symmetric read so contact details survive an open → deploy cycle (issue
    // #452). No editor-only id to mint — it's a single plain object.
    ...(recipe.contactDetails !== undefined
      ? { contactDetails: recipe.contactDetails }
      : {}),
    // Symmetric read so processors survive an open → deploy cycle (issue #255).
    // Mint an editor-only id per processor (mirrors RecipeFieldDraft); stripped
    // again on serialize. `!== undefined` keeps "absent" distinct from `[]`.
    ...(recipe.processors !== undefined
      ? {
          processors: recipe.processors.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
          })),
        }
      : {}),
    steps,
  };
}
