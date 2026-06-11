import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import { getServerEnv } from "#/config/env";
import { isAutoConfirmedField } from "./auto-confirm";
import { getFormDefinition } from "./defs";
import { isForcedHandoff } from "./policy";

// show-hide is NOT here: the toggle is collected as a yes/no question.
// Leaving it uncollectable made every field conditional on a toggle
// unreachable in chat (e.g. the passport-number alternative on the post
// office redirection form, whose ID field is only optionalIf the toggle
// is open — a user without a National ID could never finish in chat).
const UNCOLLECTABLE: ReadonlySet<HtmlTypes> = new Set<HtmlTypes>(["file"]);

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

export function describeField(field: Primitive, escape?: Primitive): string {
  // A show-hide toggle is an optional yes/no section opener, not an input —
  // the label is the affordance text ("Use passport number instead"), so the
  // model needs the yes/no framing spelled out.
  if (field.htmlType === "show-hide") {
    return `- ${field.fieldId}: show-hide section toggle (yes/no, optional)  // ${field.label}`;
  }
  const req = isRequired(field) ? "required" : "optional";
  const opts =
    "options" in field && field.options?.length
      ? ` [${field.options.map((o) => o.value).join("|")}]`
      : "";
  // An escape toggle means this field is one half of an either/or — the forms
  // UI shows the toggle directly under the input ("National ID — or use a
  // passport instead"), so the schema line carries the alternative too.
  const alt = escape
    ? `; alternative: ${escape.fieldId} — "${escape.label}"`
    : "";
  return `- ${field.fieldId}: ${field.htmlType} (${req}${alt})${opts}  // ${field.label}`;
}

// A show-hide toggle is an "escape hatch" when another field's optionalIf
// targets it: opening the toggle relaxes that field's requirement and reveals
// the alternative (the post-office National-ID/passport pattern). Escape
// toggles are folded into the target field's ask instead of being asked as
// their own yes/no question.
export function findEscapeToggle(
  contract: ServiceContract,
  field: Primitive,
): Primitive | null {
  const opt = field.behaviours?.find((b) => b.type === "optionalIf");
  if (!opt || !("targetFieldId" in opt)) return null;
  const target = buildFieldIndex(contract).get(opt.targetFieldId)?.field;
  return target?.htmlType === "show-hide" ? target : null;
}

// Toggle ids that are some field's escape hatch — omitted from the schema
// disclosure so the model never asks them standalone.
function escapeToggleIds(contract: ServiceContract): Set<string> {
  const ids = new Set<string>();
  for (const step of contract.steps) {
    for (const el of step.elements) {
      const escape = findEscapeToggle(contract, el);
      if (escape) ids.add(escape.fieldId);
    }
  }
  return ids;
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

// The canonical ask-order walk: every active, chat-collectable field in step
// order, with the escape-toggle folding applied (toggles ride on their target
// field; a relaxed field disappears while its escape is open and unanswered).
// Shared by the schema disclosure AND the ask cursor so they can't disagree
// about what the form's questions are.
function* askableFields(
  contract: ServiceContract,
  active: Map<string, Set<string>>,
  values: Record<string, unknown>,
): Generator<{ stepId: string; field: Primitive; escape?: Primitive }> {
  const escapes = escapeToggleIds(contract);
  for (const step of contract.steps) {
    const ids = active.get(step.stepId);
    if (!ids) continue;
    for (const el of step.elements) {
      if (!ids.has(el.fieldId)) continue;
      if (!isChatCollectable(el)) continue;
      // Auto-confirmed fields (the feedback form's declaration) are filled for
      // the user at submit — never disclosed, never asked, never reviewed.
      if (isAutoConfirmedField(contract, el.fieldId)) continue;
      // Escape toggles ride along on their target field's line/ask — a
      // standalone "Use passport number instead?" with no ID question in
      // sight reads as a non sequitur.
      if (escapes.has(el.fieldId)) continue;
      const escape = findEscapeToggle(contract, el) ?? undefined;
      // Once the user chose the alternative, don't re-offer the relaxed
      // field ("National ID (optional)?" right after "use my passport") —
      // unless they already answered it.
      if (escape && values[escape.fieldId] === "true" && !values[el.fieldId]) {
        continue;
      }
      yield { stepId: step.stepId, field: el, escape };
    }
  }
}

export function summarizeActive(
  contract: ServiceContract,
  active: Map<string, Set<string>>,
  values: Record<string, unknown> = {},
): string | null {
  const lines: string[] = [];
  for (const { field, escape } of askableFields(contract, active, values)) {
    lines.push(describeField(field, escape));
  }
  if (!lines.length) return null;
  return [`Form: ${contract.title} (${contract.formId})`, "", ...lines].join(
    "\n",
  );
}

// The ask cursor: the first question not yet collected and not yet asked.
// "Asked but uncollected" = the user skipped an optional field — the cursor
// moves past it instead of looping. Ordering lives HERE, in code, not in the
// model: the prompt-level "ASK IN SCHEMA ORDER" rule was probabilistic and
// the model regularly skipped ahead.
export function nextAskableField(
  contract: ServiceContract,
  values: Record<string, unknown>,
  asked: ReadonlySet<string>,
): { stepId: string; field: Primitive } | null {
  const active = getActiveFieldIds(contract, values).byStep;
  for (const { stepId, field } of askableFields(contract, active, values)) {
    const value = values[field.fieldId];
    if (value !== undefined && value !== "") continue;
    if (asked.has(field.fieldId)) continue;
    return { stepId, field };
  }
  return null;
}

// The step title to ANNOUNCE when this field opens a new section, or null if
// it doesn't. A field opens a new section when none of the already-asked
// fields live in its step (the cursor just crossed a step boundary) AND the
// step has a meaningful title. This is how the user learns "these next
// questions are your emergency contact / professional referee" rather than
// re-entering their own details — the titles are in the contract; the chat
// just wasn't surfacing them. No new session state: derived from askedFieldIds.
export function sectionForField(
  contract: ServiceContract,
  fieldId: string,
  asked: ReadonlySet<string>,
): string | null {
  const stepByFieldId = new Map<string, string>();
  let stepId: string | undefined;
  let title: string | undefined;
  for (const step of contract.steps) {
    for (const el of step.elements) {
      stepByFieldId.set(el.fieldId, step.stepId);
      if (el.fieldId === fieldId) {
        stepId = step.stepId;
        title = step.title;
      }
    }
  }
  if (!title) return null;
  for (const askedId of asked) {
    if (askedId === fieldId) continue;
    if (stepByFieldId.get(askedId) === stepId) return null;
  }
  return title;
}

export interface ActiveFormSchema {
  slug: string;
  schema: string;
  contract: ServiceContract;
  activeFieldIds: Set<string>;
}

// A form is handed off (link only, never collected inline) when the POLICY
// says so, or when the live contract carries a structural blocker:
//   - File field: chat has no upload primitive.
//   - Required repeatable: unsubmittable in chat (no array input).
//   - Payment: read from the safe `requiresPayment` boolean on the public
//     contract — `processors` is stripped server-side, so the previous
//     `contract.processors?.some(...)` check was dead and payment forms
//     (birth/death/marriage certs) got collected inline. See #965.
// The policy entry is the hard floor; the heuristics are the belt for a
// "collect" form whose recipe gains one of these signals on a republish.
export function needsHandoff(contract: ServiceContract): boolean {
  const hasFile = contract.steps.some((step) =>
    step.elements.some((el) => el.htmlType === "file"),
  );
  const hasRequiredRepeatable = contract.steps.some((step) =>
    step.elements.some((el) => hasRepeatableBehaviour(el) && isRequired(el)),
  );
  return (
    hasFile ||
    hasRequiredRepeatable ||
    contract.requiresPayment === true ||
    isForcedHandoff(contract.formId)
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
  const schema = summarizeActive(contract, active.byStep, currentValues);
  if (!schema) return { kind: "none" };
  return {
    kind: "collect",
    form: { slug, schema, contract, activeFieldIds: active.flat },
  };
}
