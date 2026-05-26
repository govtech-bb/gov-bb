import type { RecipeDraft } from "./types";
import type { RegistryCatalog } from "./catalog";
import { getRegistryItem } from "./catalog";
import type { ComponentDefinition, BlockDefinition } from "./definition-types";

export interface ResolvedFieldId {
  fieldId: string;
  editorFieldId: string;
  stepId: string;
  stepTitle: string;
  display: string;
  childFieldId?: string;
}

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
          display: componentDef.displayName,
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
            display: `${blockDef.displayName} › ${element.label ?? element.fieldId}`,
            childFieldId: element.fieldId,
          });
        }
      }
    }
  }

  return resolved;
}
