import { resolveFieldIds } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

export interface FieldRef {
  stepId: string;
  // The resolved *runtime* field id — what a conditional's `targetFieldId`
  // must equal to fire (see behavior-helper's getFullFieldId). This is the
  // overridden id when an author set a Field ID Override, the primitive's
  // fieldId for a component, or the child's fieldId for a block element.
  fieldId: string;
  displayName: string;
  // True when the target field holds a real boolean at runtime (checkbox or
  // show-hide). The behaviours editor renders a true/false value control for
  // boolean targets so the condition value is captured as a boolean. (#565)
  isBoolean: boolean;
}

export interface StepRef {
  stepId: string;
  title: string;
}

// Delegate to resolveFieldIds (the ADR-0010 single source of truth for runtime
// ids): it expands blocks into their child fields and applies fieldId
// overrides, so option values match what conditionals match against at runtime.
export function getFieldRefs(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldRef[] {
  return resolveFieldIds(draft, catalog).map((entry) => ({
    stepId: entry.stepId,
    fieldId: entry.fieldId,
    displayName: entry.display,
    isBoolean: entry.isBoolean,
  }));
}

export function getStepRefs(draft: RecipeDraft): StepRef[] {
  return draft.steps.map((s) => ({ stepId: s.stepId, title: s.title }));
}
