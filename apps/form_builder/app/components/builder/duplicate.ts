import {
  getRegistryItem,
  resolveFieldIds,
  type RecipeDraft,
  type RecipeFieldDraft,
  type RecipeStepDraft,
  type RegistryCatalog,
} from "@govtech-bb/form-builder";
import {
  applyFieldOverrides,
  type FieldOverrides,
} from "@govtech-bb/form-types";
import { resolveFieldLabel } from "./field-label";

function copyId(id: string, used: Set<string>): string {
  const base = id.replace(/-copy(?:-\d+)?$/, "");
  let copy = `${base}-copy`;
  for (let n = 2; used.has(copy); n++) copy = `${base}-copy-${n}`;
  used.add(copy);
  return copy;
}

function copyLabel(label: string, existing: string[]): string {
  const base = label.replace(/ \(copy(?: \d+)?\)$/, "");
  let copy = `${base} (copy)`;
  for (let n = 2; existing.includes(copy); n++) copy = `${base} (copy ${n})`;
  return copy;
}

const FIELD_REFERENCE_KEYS = new Set([
  "targetFieldId",
  "referenceFieldId",
  "line2FieldId",
  "parishFieldId",
  "coordinatesFieldId",
]);

// Only visit rule/config objects. Labels, markdown and answer values are literal data.
function remapRules<T>(
  value: T,
  ids: Map<string, string>,
  sourceStep: string,
  copyStep: string,
): T {
  if (Array.isArray(value))
    return value.map((entry) =>
      remapRules(entry, ids, sourceStep, copyStep),
    ) as T;
  if (!value || typeof value !== "object") return value;
  const rule = value as Record<string, unknown>;
  const sameStep = !rule.targetStepId || rule.targetStepId === sourceStep;
  return Object.fromEntries(
    Object.entries(rule).map(([key, entry]) => {
      if (
        sameStep &&
        FIELD_REFERENCE_KEYS.has(key) &&
        typeof entry === "string"
      )
        return [key, ids.get(entry) ?? entry];
      if (key === "targetStepId" && entry === sourceStep)
        return [key, copyStep];
      if (key === "fieldIds" && Array.isArray(entry))
        return [key, entry.map((id) => ids.get(id) ?? id)];
      if (key === "value" || key === "defaultValue") return [key, entry];
      return [key, remapRules(entry, ids, sourceStep, copyStep)];
    }),
  ) as T;
}

function copyFields(
  draft: RecipeDraft,
  step: RecipeStepDraft,
  source: RecipeFieldDraft[],
  catalog: RegistryCatalog,
  copyStep: string,
) {
  const used = new Set(
    resolveFieldIds(draft, catalog).map((field) => field.fieldId),
  );
  const ids = new Map<string, string>();
  const fields = structuredClone(source);
  const pending: {
    overrides: FieldOverrides;
    effective: ReturnType<typeof applyFieldOverrides>;
  }[] = [];
  for (const field of fields) {
    const item = getRegistryItem(field.ref, catalog);
    if (!item) throw new Error(`Question type unavailable: ${field.ref}`);
    field.id = crypto.randomUUID();
    if ("block" in item) {
      field.childOverrides ??= {};
      for (const child of item.block.elements) {
        const overrides = (field.childOverrides[child.fieldId] ??= {});
        const effective = applyFieldOverrides(child, overrides);
        overrides.fieldId = copyId(effective.fieldId, used);
        ids.set(effective.fieldId, overrides.fieldId);
        pending.push({ overrides, effective });
      }
    } else {
      const effective = applyFieldOverrides(item.primitive, field.overrides);
      field.overrides.fieldId = copyId(effective.fieldId, used);
      ids.set(effective.fieldId, field.overrides.fieldId);
      pending.push({ overrides: field.overrides, effective });
    }
  }
  // Resolve defaults as well as overrides, after every copied sibling has an ID.
  for (const { overrides, effective } of pending) {
    if (effective.behaviours !== undefined)
      overrides.behaviours = remapRules(
        effective.behaviours,
        ids,
        step.stepId,
        copyStep,
      );
    if (effective.validations !== undefined)
      overrides.validations = remapRules(
        effective.validations,
        ids,
        step.stepId,
        copyStep,
      );
    if (effective.conditionalLabel !== undefined)
      overrides.conditionalLabel = remapRules(
        effective.conditionalLabel,
        ids,
        step.stepId,
        copyStep,
      );
    if (effective.geocodeTargets !== undefined)
      overrides.geocodeTargets = remapRules(
        effective.geocodeTargets,
        ids,
        step.stepId,
        copyStep,
      );
  }
  return { fields, ids };
}

export function duplicateStepDraft(
  draft: RecipeDraft,
  step: RecipeStepDraft,
  catalog: RegistryCatalog,
): RecipeStepDraft {
  const stepId = copyId(
    step.stepId,
    new Set(draft.steps.map((item) => item.stepId)),
  );
  const { fields, ids } = copyFields(draft, step, step.fields, catalog, stepId);
  const copy = structuredClone(step);
  return {
    ...copy,
    stepId,
    title: copyLabel(
      step.title || step.stepId,
      draft.steps.map((item) => item.title),
    ),
    fields,
    behaviours: remapRules(copy.behaviours, ids, step.stepId, stepId),
    ...(copy.conditionalMarkdown && {
      conditionalMarkdown: remapRules(
        copy.conditionalMarkdown,
        ids,
        step.stepId,
        stepId,
      ),
    }),
  };
}

export function duplicateFieldDraft(
  draft: RecipeDraft,
  step: RecipeStepDraft,
  field: RecipeFieldDraft,
  catalog: RegistryCatalog,
): RecipeFieldDraft {
  const {
    fields: [copy],
  } = copyFields(draft, step, [field], catalog, step.stepId);
  if (copy.kind !== "block") {
    copy.overrides.label = copyLabel(
      resolveFieldLabel(field, getRegistryItem(field.ref, catalog)),
      step.fields.map((item) =>
        resolveFieldLabel(item, getRegistryItem(item.ref, catalog)),
      ),
    );
  }
  return copy;
}
