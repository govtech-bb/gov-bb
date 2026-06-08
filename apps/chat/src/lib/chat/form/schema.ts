import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import { getServerEnv } from "#/config/env";
import { getFormDefinition } from "./defs";

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

export function buildFieldIndex(
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

export function getActiveFieldIds(
  contract: ServiceContract,
  flatValues: Record<string, unknown>,
): { byStep: Map<string, Set<string>>; flat: Set<string> } {
  const scoped = flatToStepScoped(contract, flatValues);
  const { activeFieldIds } = evaluateFormConditions(contract, scoped);
  const flat = new Set<string>();
  for (const ids of activeFieldIds.values()) for (const id of ids) flat.add(id);
  return { byStep: activeFieldIds, flat };
}

function summarizeActive(
  contract: ServiceContract,
  active: Map<string, Set<string>>,
): string | null {
  const lines: string[] = [];
  for (const step of contract.steps) {
    const ids = active.get(step.stepId);
    if (!ids) continue;
    for (const el of step.elements) {
      if (!ids.has(el.fieldId)) continue;
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
  contract: ServiceContract;
  activeFieldIds: Set<string>;
}

// File uploads, payment, and sensitive data (bank details / legal declarations)
// can't safely happen in open chat. If a form involves any of these, we hand
// the user a link to the full form rather than collecting it inline.
//
// Why each input:
//   - File: chat has no upload primitive.
//   - Payment: read from the safe `requiresPayment` boolean on the public
//     contract — `processors` is stripped server-side, so the previous
//     `contract.processors?.some(...)` check was dead and payment forms (birth
//     /death/marriage certs) got collected inline. See #965.
//   - Sensitive data: bank fields and the declaration step belong in a
//     structured UI with validation, secure framing, and the declaration
//     wording visible — none of which chat can guarantee. See #966 / #931.
//
// Scans the whole contract (not just active fields) since the relevant elements
// may be conditionally revealed.

// Conventional step IDs across published recipes. Author guide: any new form
// step that collects bank/financial data or requires a legal agreement should
// use one of these IDs (or be added here) so the chat hands off correctly.
//
// Scope note: ~60 of ~62 published recipes end with a `declaration` step, so
// including it here effectively turns the chat into a form-finder for almost
// every form. That is the intended #966 / #931 policy — the chat cannot
// reliably present declaration wording and accept agreement (it loops on "Do
// you agree?"), so the only safe behaviour is to hand off. Reviewers: remove
// `"declaration"` here to narrow the trigger.
const SENSITIVE_STEP_IDS = new Set([
  "declaration",
  "bank-account",
  "bank-details",
]);

// Field-level fallback for forms that don't use the conventional step IDs but
// still collect bank/account details. Conservative — only matches identifiers
// that are unambiguously financial.
const SENSITIVE_FIELD_PATTERN =
  /^(bank-|account-(name|number|holder|type)|sort-code|routing-)/;

function collectsSensitiveData(contract: ServiceContract): boolean {
  return contract.steps.some(
    (step) =>
      SENSITIVE_STEP_IDS.has(step.stepId) ||
      step.elements.some((el) => SENSITIVE_FIELD_PATTERN.test(el.fieldId)),
  );
}

export function needsHandoff(contract: ServiceContract): boolean {
  const hasFile = contract.steps.some((step) =>
    step.elements.some((el) => el.htmlType === "file"),
  );
  return (
    hasFile ||
    contract.requiresPayment === true ||
    collectsSensitiveData(contract)
  );
}

export type FormResolution =
  | { kind: "collect"; form: ActiveFormSchema }
  | { kind: "handoff"; slug: string; title: string; url: string }
  | { kind: "none" };

export async function resolveActiveForm(
  slug: string,
  currentValues: Record<string, unknown>,
): Promise<FormResolution> {
  const contract = await getFormDefinition(slug);
  if (!contract) return { kind: "none" };

  if (needsHandoff(contract)) {
    const base = getServerEnv().FORMS_URL;
    return {
      kind: "handoff",
      slug,
      title: contract.title,
      url: `${base}/forms/${encodeURIComponent(slug)}`,
    };
  }

  const active = getActiveFieldIds(contract, currentValues);
  const schema = summarizeActive(contract, active.byStep);
  if (!schema) return { kind: "none" };
  return {
    kind: "collect",
    form: { slug, schema, contract, activeFieldIds: active.flat },
  };
}
