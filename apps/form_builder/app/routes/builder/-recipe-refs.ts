import { useMemo } from "react";
import { getRegistryItem } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

export interface FieldRef {
  stepId: string;
  fieldRef: string;
  displayName: string;
}

export interface StepRef {
  stepId: string;
  title: string;
}

export function getFieldRefs(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldRef[] {
  const refs: FieldRef[] = [];
  for (const step of draft.steps) {
    for (const field of step.fields) {
      const item = getRegistryItem(field.ref, catalog);
      refs.push({
        stepId: step.stepId,
        fieldRef: field.ref,
        displayName: item?.displayName ?? field.ref,
      });
    }
  }
  return refs;
}

export function getStepRefs(draft: RecipeDraft): StepRef[] {
  return draft.steps.map((s) => ({ stepId: s.stepId, title: s.title }));
}

// React hook wrappers — kept for any consumers that prefer the hook form.
export function useFieldRefs(
  draft: RecipeDraft,
  catalog: RegistryCatalog,
): FieldRef[] {
  return useMemo(() => getFieldRefs(draft, catalog), [draft, catalog]);
}

export function useStepRefs(draft: RecipeDraft): StepRef[] {
  return useMemo(() => getStepRefs(draft), [draft.steps]);
}
