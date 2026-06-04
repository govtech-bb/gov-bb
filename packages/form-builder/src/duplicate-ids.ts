import type {
  ServiceContractRecipe,
  ValidationIssue,
} from "@govtech-bb/form-types";
import type { RecipeDraft } from "./types";
import type { RegistryCatalog } from "./catalog";
import { getRegistryItem } from "./catalog";
import { deserializeRecipe } from "./serialization";
import type { ComponentDefinition, BlockDefinition } from "./definition-types";

export interface ResolvedFieldId {
  fieldId: string;
  editorFieldId: string;
  stepId: string;
  stepTitle: string;
  display: string;
  childFieldId?: string;
  // True when the resolved field holds a real boolean at runtime (a show-hide
  // toggle). The behaviours editor uses this to capture a conditional value as
  // a boolean rather than a string. (#565)
  isBoolean: boolean;
}

// htmlTypes whose runtime value is a real boolean. Only `show-hide` qualifies:
// its value is `true`/`false` (see apps/forms field-renderer). A `checkbox`
// stores its selected option *value* (a string, or a string array for
// multi-option), so it is NOT boolean despite the name.
const BOOLEAN_HTML_TYPES = new Set(["show-hide"]);

export interface FieldIdCollision {
  id: string;
  locations: ResolvedFieldId[];
}

export interface StepIdCollision {
  stepId: string;
  locations: Array<{ stepId: string; stepTitle: string; stepIndex: number }>;
}

export function findDuplicateFieldIds(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldIdCollision[] {
  const resolved = resolveFieldIds(draft, catalog);

  const byId = new Map<string, ResolvedFieldId[]>();
  for (const entry of resolved) {
    const group = byId.get(entry.fieldId);
    if (group) group.push(entry);
    else byId.set(entry.fieldId, [entry]);
  }

  const collisions: FieldIdCollision[] = [];
  for (const [id, locations] of byId) {
    if (locations.length >= 2) collisions.push({ id, locations });
  }
  return collisions;
}

export function findDuplicateStepIds(draft: RecipeDraft): StepIdCollision[] {
  const byId = new Map<string, StepIdCollision["locations"]>();

  draft.steps.forEach((step, stepIndex) => {
    const stepId = step.stepId?.trim();
    if (!stepId) return; // ignore blank/empty stepIds
    const location = { stepId: step.stepId, stepTitle: step.title, stepIndex };
    const group = byId.get(stepId);
    if (group) group.push(location);
    else byId.set(stepId, [location]);
  });

  const collisions: StepIdCollision[] = [];
  for (const [stepId, locations] of byId) {
    if (locations.length >= 2) collisions.push({ stepId, locations });
  }
  return collisions;
}

export function findRecipeIdCollisions(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): {
  fieldIdCollisions: FieldIdCollision[];
  stepIdCollisions: StepIdCollision[];
} {
  return {
    fieldIdCollisions: findDuplicateFieldIds(draft, catalog),
    stepIdCollisions: findDuplicateStepIds(draft),
  };
}

/**
 * Run the duplicate-id detector against a persisted-format recipe
 * (`ServiceContractRecipe`) rather than the editor's `RecipeDraft`.
 *
 * Server/ingest callers (the `/builder/registry/validate` route and the AI
 * publish handler) hold a recipe, not a draft. `deserializeRecipe` bridges the
 * two so every consumer reuses the single detector instead of re-deriving id
 * resolution (per ADR 0010).
 *
 * Defensive on purpose: the AI publish path passes an unvalidated recipe, so a
 * structurally malformed shape (e.g. `steps` missing or not an array) yields no
 * collisions and never throws — full contract conformance is a separate check.
 */
export function findRecipeIdCollisionsFromRecipe(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
): {
  fieldIdCollisions: FieldIdCollision[];
  stepIdCollisions: StepIdCollision[];
} {
  if (!recipe || !Array.isArray((recipe as { steps?: unknown }).steps)) {
    return { fieldIdCollisions: [], stepIdCollisions: [] };
  }
  return findRecipeIdCollisions(deserializeRecipe(recipe, catalog), catalog);
}

/**
 * Format a set of resolved id collisions into `ValidationIssue[]`, so the
 * builder UI and the server `/validate` endpoint emit identical messages for
 * the same collision. The strings here are the single source of truth.
 */
export function formatCollisionIssues(collisions: {
  fieldIdCollisions: FieldIdCollision[];
  stepIdCollisions: StepIdCollision[];
}): ValidationIssue[] {
  return [
    ...collisions.fieldIdCollisions.map((c) => ({
      path: `fieldId:${c.id}`,
      message: `Field ID "${c.id}" is used by ${c.locations.length} fields: ${c.locations
        .map((l) => `${l.stepTitle || l.stepId} › ${l.display}`)
        .join("; ")}.`,
    })),
    ...collisions.stepIdCollisions.map((c) => ({
      path: `stepId:${c.stepId}`,
      message: `Step ID "${c.stepId}" is used by ${c.locations.length} steps: ${c.locations
        .map((l) => l.stepTitle || l.stepId)
        .join("; ")}.`,
    })),
  ];
}

export function fieldIdDuplicatesAnother(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
  editorFieldId: string,
  candidateId: string,
): boolean {
  const candidate = candidateId.trim();
  if (!candidate) return false; // blank never duplicates

  return resolveFieldIds(draft, catalog).some(
    (entry) =>
      entry.editorFieldId !== editorFieldId && entry.fieldId === candidate,
  );
}

export function resolveFieldIds(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): ResolvedFieldId[] {
  const resolved: ResolvedFieldId[] = [];

  for (const step of draft.steps) {
    for (const field of step.fields) {
      const item = getRegistryItem(field.ref, catalog);
      if (!item) continue;

      if (field.ref.startsWith("components/")) {
        const componentDef = item as ComponentDefinition;
        const fieldId =
          field.overrides.fieldId ?? componentDef.primitive.fieldId;
        if (!fieldId) continue;
        resolved.push({
          fieldId,
          editorFieldId: field.id,
          stepId: step.stepId,
          stepTitle: step.title,
          display:
            field.overrides.label ??
            componentDef.primitive.label ??
            componentDef.displayName,
          isBoolean: BOOLEAN_HTML_TYPES.has(componentDef.primitive.htmlType),
        });
      } else if (field.ref.startsWith("blocks/")) {
        const blockDef = item as BlockDefinition;
        for (const element of blockDef.block.elements) {
          const childOverride = field.childOverrides?.[element.fieldId];
          const fieldId = childOverride?.fieldId ?? element.fieldId;
          if (!fieldId) continue;
          resolved.push({
            fieldId,
            editorFieldId: field.id,
            stepId: step.stepId,
            stepTitle: step.title,
            display: `${blockDef.displayName} › ${childOverride?.label ?? element.label ?? element.fieldId}`,
            childFieldId: element.fieldId,
            isBoolean: BOOLEAN_HTML_TYPES.has(element.htmlType),
          });
        }
      }
    }
  }

  return resolved;
}
