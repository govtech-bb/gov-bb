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

// Shared by the schema disclosure (what the model is told to collect) and
// submit validation (what counts against the form) so they can't drift.
export function isChatCollectable(field: Primitive): boolean {
  if (UNCOLLECTABLE.has(field.htmlType)) return false;
  return !field.isHidden && !field.isDisabled && !hasRepeatableBehaviour(field);
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
      if (!isChatCollectable(el)) continue;
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

// File uploads, payment, and a small set of explicitly listed forms can't
// safely be collected in open chat. If a form is one of these, we hand the
// user a link to the full form rather than collecting it inline.
//
// Why each input:
//   - File: chat has no upload primitive.
//   - Payment: read from the safe `requiresPayment` boolean on the public
//     contract — `processors` is stripped server-side, so the previous
//     `contract.processors?.some(...)` check was dead and payment forms
//     (birth/death/marriage certs) got collected inline. See #965.
//   - Form ID on the exclusion list below: forms that collect bank account
//     details or otherwise can't be safely filled in chat. See #966 / #931.

// Explicit handoff list. A form ID belongs here when it collects bank/account
// details or has another structural reason the chat cannot collect it safely.
// We list each form by ID instead of pattern-matching on step or field names
// so the trigger stays auditable and stable as recipes evolve.
//
// Maintenance: when a new form is published that collects bank/financial
// details (look for `bank-*`, `account-*`, `sort-code`, `routing-*` field IDs,
// or a `bank-account` / `bank-details` step), add its formId here.
const HANDOFF_FORM_IDS: ReadonlySet<string> = new Set([
  "duties-performed-exam-claim",
  "get-a-primary-school-textbook-grant",
  "school-uniform-grant-barbados",
  "smart-stream-vendor-registration",
  "textbook-grant-application",
]);

// Belt-and-suspenders backstop for forms that SHOULD already be caught by the
// `requiresPayment` / file-field heuristics above — but only when the published
// recipe actually carries those signals. The chat reads the contract from the
// live forms API, so a recipe shipped (or re-published) without
// `requiresPayment: true`, or with its document upload modelled as anything
// other than a `file` field, would silently re-open inline collection. That is
// exactly how the payment certs leaked before (#965). Pinning these
// known-sensitive forms by ID guarantees the handoff regardless of remote data,
// so a recipe regression can no longer expose payments or document uploads in
// chat. Slugs verified against apps/chat/eval/golden.json (doc id `service-<formId>`).
//   - get-birth-certificate / get-death-certificate / get-marriage-certificate:
//     payment (#916 / #917 / #918).
//   - apply-for-conductor-licence / sell-goods-services-beach-park: document
//     upload (#921 / #928).
const ALWAYS_HANDOFF_FORM_IDS: ReadonlySet<string> = new Set([
  "get-birth-certificate",
  "get-death-certificate",
  "get-marriage-certificate",
  "apply-for-conductor-licence",
  "sell-goods-services-beach-park",
]);

export function needsHandoff(contract: ServiceContract): boolean {
  const hasFile = contract.steps.some((step) =>
    step.elements.some((el) => el.htmlType === "file"),
  );
  // A REQUIRED repeatable field is unsubmittable in chat (no array input, the
  // model is never told about it) — hand off. Optional repeatables just skip.
  const hasRequiredRepeatable = contract.steps.some((step) =>
    step.elements.some((el) => hasRepeatableBehaviour(el) && isRequired(el)),
  );
  return (
    hasFile ||
    hasRequiredRepeatable ||
    contract.requiresPayment === true ||
    HANDOFF_FORM_IDS.has(contract.formId) ||
    ALWAYS_HANDOFF_FORM_IDS.has(contract.formId)
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
