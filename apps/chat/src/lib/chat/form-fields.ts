import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import { getFormDefinition } from "./form-api";

// htmlTypes the chat LLM cannot collect via text. File uploads come in
// Phase 3; show-hide is a presentational UI control with no value.
const UNCOLLECTABLE: ReadonlySet<HtmlTypes> = new Set<HtmlTypes>([
  "file",
  "show-hide",
]);

function hasRepeatableBehaviour(field: {
  behaviours?: Array<{ type: string }>;
}): boolean {
  return !!field.behaviours?.some(
    (b) => b.type === "repeatable" || b.type === "fieldArray",
  );
}

function isRequired(field: Primitive): boolean {
  return !!field.validations?.required;
}

function describeField(field: Primitive): string {
  const req = isRequired(field) ? "required" : "optional";
  const opts =
    "options" in field && field.options?.length
      ? ` [${field.options.map((o) => o.value).join("|")}]`
      : "";
  return `- ${field.fieldId}: ${field.htmlType} (${req})${opts}  // ${field.label}`;
}

function buildFieldIndex(
  contract: ServiceContract,
): Map<string, { stepId: string; field: Primitive }> {
  const map = new Map<string, { stepId: string; field: Primitive }>();
  for (const step of contract.steps) {
    for (const el of step.elements) {
      map.set(el.fieldId, { stepId: step.stepId, field: el });
    }
  }
  return map;
}

function flatToStepScoped(
  contract: ServiceContract,
  flat: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const idx = buildFieldIndex(contract);
  const out: Record<string, Record<string, unknown>> = {};
  for (const [fieldId, value] of Object.entries(flat)) {
    const info = idx.get(fieldId);
    if (!info) continue;
    (out[info.stepId] ??= {})[fieldId] = value;
  }
  return out;
}

function summarizeActive(
  contract: ServiceContract,
  flatValues: Record<string, unknown>,
): string | null {
  const scoped = flatToStepScoped(contract, flatValues);
  const { activeFieldIds } = evaluateFormConditions(contract, scoped);

  const lines: string[] = [];
  for (const step of contract.steps) {
    const active = activeFieldIds.get(step.stepId);
    if (!active) continue;
    for (const el of step.elements) {
      if (!active.has(el.fieldId)) continue;
      if (el.isHidden) continue;
      if (UNCOLLECTABLE.has(el.htmlType)) continue;
      if (hasRepeatableBehaviour(el)) continue;
      lines.push(describeField(el));
    }
  }
  if (!lines.length) return null;
  return [`Form: ${contract.title} (${contract.formId})`, "", ...lines].join(
    "\n",
  );
}

export interface ActiveFormSchema {
  slug: string;
  schema: string;
  activeFieldIds: Set<string>;
}

export async function loadActiveFormSchema(
  slug: string,
  currentValues: Record<string, unknown>,
): Promise<ActiveFormSchema | null> {
  const contract = await getFormDefinition(slug);
  if (!contract) return null;
  const schema = summarizeActive(contract, currentValues);
  if (!schema) return null;
  const scoped = flatToStepScoped(contract, currentValues);
  const { activeFieldIds } = evaluateFormConditions(contract, scoped);
  const flat = new Set<string>();
  for (const ids of activeFieldIds.values()) for (const id of ids) flat.add(id);
  return { slug, schema, activeFieldIds: flat };
}
