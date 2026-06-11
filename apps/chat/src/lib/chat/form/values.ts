import type {
  HtmlTypes,
  OptionalIfBehaviour,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import {
  evaluateCondition,
  flattenStepValues,
} from "@govtech-bb/form-conditions";
import { validateField } from "@govtech-bb/form-validation";
import type { StepScopedValues } from "@govtech-bb/form-validation";
import { buildFieldIndex, isChatCollectable } from "./schema";

export type FieldError = { field: string; message: string };
export type ValidationResult =
  | { ok: true; valuesByStep: Record<string, Record<string, unknown>> }
  | { ok: false; errors: FieldError[] };

type Coerced = { value: unknown } | { error: string };
type Coercer = (field: Primitive, raw: string) => Coerced;

// Date parts are stored as the literal digit-strings the user typed, not
// numbers (#815) — matching the dateValueInputSchema the forms API validates
// against. The regex capture groups are already strings; keep them verbatim.
function parseDate(
  raw: string,
): { day: string; month: string; year: string } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return { year: iso[1]!, month: iso[2]!, day: iso[3]! };
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (dmy) return { day: dmy[1]!, month: dmy[2]!, year: dmy[3]! };
  return null;
}

function fieldOptions(field: Primitive): string[] {
  return "options" in field && field.options
    ? field.options.map((o) => o.value)
    : [];
}

// The choice pills send the option LABEL as the user's message; the model
// then maps label → value before set_field — probabilistically. Accept the
// label here (case-insensitive; exact value match wins) so "Saint Michael"
// records st-michael without a model retry.
function matchOption(field: Primitive, pick: string): string | null {
  if (!("options" in field) || !field.options) return null;
  for (const o of field.options) if (o.value === pick) return o.value;
  const lower = pick.toLowerCase();
  for (const o of field.options) {
    if (o.value.toLowerCase() === lower || o.label.toLowerCase() === lower) {
      return o.value;
    }
  }
  return null;
}

function coerceList(field: Primitive, raw: string): Coerced {
  const picks = raw.includes(",")
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [raw];
  const matched: string[] = [];
  for (const p of picks) {
    const value = matchOption(field, p);
    if (value === null) {
      return { error: `must be one of: ${fieldOptions(field).join(", ")}` };
    }
    matched.push(value);
  }
  return { value: matched };
}

function coerceEnum(field: Primitive, raw: string): Coerced {
  // Multi-selects collect like option-backed checkboxes: a comma list of
  // option values.
  if (field.multiple) return coerceList(field, raw);
  const value = matchOption(field, raw);
  if (value === null) {
    return { error: `must be one of: ${fieldOptions(field).join(", ")}` };
  }
  return { value };
}

function coerceBoolean(raw: string): Coerced {
  const lower = raw.toLowerCase();
  if (["true", "yes", "on", "1"].includes(lower)) return { value: true };
  if (["false", "no", "off", "0", ""].includes(lower)) return { value: false };
  return { error: "must be yes/no" };
}

function coerceCheckbox(field: Primitive, raw: string): Coerced {
  if (fieldOptions(field).length) return coerceList(field, raw);
  return coerceBoolean(raw);
}

const COERCERS: Record<HtmlTypes, Coercer> = {
  text: (_f, raw) => ({ value: raw }),
  textarea: (_f, raw) => ({ value: raw }),
  email: (_f, raw) => ({ value: raw }),
  tel: (_f, raw) => ({ value: raw }),
  number: (_f, raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? { value: n } : { error: "must be a number" };
  },
  date: (_f, raw) => {
    const parsed = parseDate(raw);
    return parsed
      ? { value: parsed }
      : { error: "must be a date (YYYY-MM-DD or DD/MM/YYYY)" };
  },
  select: coerceEnum,
  radio: coerceEnum,
  checkbox: coerceCheckbox,
  // Unreachable: forms with file fields hand off (needsHandoff) and the
  // fields are never chat-collectable. The key only satisfies the Record type.
  file: () => ({ error: "file fields are not collected in chat" }),
  // The toggle holds a boolean in the forms app (open/closed) — submit the
  // same shape, not the user's "yes" string.
  "show-hide": (_f, raw) => coerceBoolean(raw),
};

// The condition engine matches the RAW session string against the behaviour
// value via String() coercion (`String(true)` === "true"), so a show-hide
// answer must be stored as exactly "true"/"false" — "yes" would never open
// the section. The same applies to option-backed fields now that coercion
// accepts LABELS: a conditional on `value: "yes-option"` must see the option
// value in the session, not the label the pill sent. Free-text fields keep
// the user's raw value untouched.
export function canonicalizeRaw(field: Primitive, raw: string): string {
  if (field.htmlType === "show-hide") {
    const coerced = coerceBoolean(raw.trim());
    return "error" in coerced ? raw : String(coerced.value);
  }
  if (fieldOptions(field).length) {
    const coerced = COERCERS[field.htmlType](field, raw.trim());
    if ("error" in coerced) return raw;
    return Array.isArray(coerced.value)
      ? (coerced.value as string[]).join(",")
      : String(coerced.value);
  }
  return raw;
}

// Coercion failures are collected per field; other fields still coerce so
// cross-field rules see full context.
function coerceToSteps(
  contract: ServiceContract,
  fields: Record<string, string>,
  activeFieldIds?: Set<string>,
): {
  valuesByStep: Record<string, Record<string, unknown>>;
  errors: FieldError[];
} {
  const idx = buildFieldIndex(contract);
  const errors: FieldError[] = [];
  const valuesByStep: Record<string, Record<string, unknown>> = {};

  for (const [fieldId, raw] of Object.entries(fields)) {
    const info = idx.get(fieldId);
    if (!info) {
      errors.push({ field: fieldId, message: "unknown field" });
      continue;
    }
    if (activeFieldIds && !activeFieldIds.has(fieldId)) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const coerced = COERCERS[info.field.htmlType](info.field, trimmed);
    if ("error" in coerced) {
      errors.push({ field: fieldId, message: coerced.error });
      continue;
    }
    (valuesByStep[info.stepId] ??= {})[fieldId] = coerced.value;
  }

  return { valuesByStep, errors };
}

// Mirror of the forms app's optionalIf handling (validation-builder.ts):
// when every optionalIf condition on a field matches, its `required` rule is
// stripped before the shared engine runs — the shared validateField knows
// nothing about optionalIf. Without this, the escape-toggle flow can never
// submit from chat (National ID stays "required" even with the passport
// section open). Format rules are kept so they still fire when filled.
function relaxOptionalIf(
  field: Primitive,
  stepId: string,
  valuesByStep: StepScopedValues,
): Primitive {
  if (!field.validations?.required) return field;
  const conds = (field.behaviours ?? []).filter(
    (b): b is OptionalIfBehaviour => b.type === "optionalIf",
  );
  if (!conds.length) return field;
  const flat = flattenStepValues(valuesByStep);
  const optional = conds.every((b) =>
    evaluateCondition(
      b.targetStepId ? b : { ...b, targetStepId: stepId },
      valuesByStep,
      flat,
    ),
  );
  if (!optional) return field;
  const { required: _required, ...validations } = field.validations;
  return { ...field, validations };
}

// Coercion first, then the shared @govtech-bb/form-validation engine — the
// same rules and error messages the forms app shows.
export function validateAndReshape(
  contract: ServiceContract,
  fields: Record<string, string>,
  activeFieldIds?: Set<string>,
): ValidationResult {
  const idx = buildFieldIndex(contract);
  const { valuesByStep, errors } = coerceToSteps(
    contract,
    fields,
    activeFieldIds,
  );

  for (const [fieldId, info] of idx) {
    if (activeFieldIds && !activeFieldIds.has(fieldId)) continue;
    if (!isChatCollectable(info.field)) continue;
    if (errors.some((e) => e.field === fieldId)) continue;
    const stepValues = valuesByStep[info.stepId] ?? {};
    const messages = validateField(
      relaxOptionalIf(
        info.field,
        info.stepId,
        valuesByStep as StepScopedValues,
      ),
      stepValues[fieldId],
      valuesByStep as StepScopedValues,
      stepValues,
    );
    for (const message of messages) errors.push({ field: fieldId, message });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, valuesByStep };
}

// Mirrors the forms app's review formatting: option labels (not values),
// dates without the weekday, Yes/No booleans.
function displayValue(field: Primitive, raw: string): string {
  const coerced = COERCERS[field.htmlType](field, raw.trim());
  if ("error" in coerced) return raw;
  const value = coerced.value;

  const optionLabel = (v: string) =>
    field.options?.find((o) => o.value === v)?.label ?? v;

  if (field.htmlType === "date") {
    const { day, month, year } = value as {
      day: string;
      month: string;
      year: string;
    };
    return new Date(Number(year), Number(month) - 1, Number(day))
      .toDateString()
      .replace(/^\w+\s/, "");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return (value as string[]).map(optionLabel).join(", ");
  }
  if (typeof value === "string") return optionLabel(value);
  return String(value);
}

export function buildReviewItems(
  contract: ServiceContract,
  fields: Record<string, string>,
  activeFieldIds: Set<string>,
): { fieldId: string; label: string; value: string }[] {
  const items: { fieldId: string; label: string; value: string }[] = [];
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (!activeFieldIds.has(el.fieldId)) continue;
      if (!isChatCollectable(el)) continue;
      // Forms-review parity: show-hide toggles are UI controls, not answers —
      // never a row (see apps/forms review.tsx).
      if (el.htmlType === "show-hide") continue;
      const raw = fields[el.fieldId];
      if (raw === undefined || raw.trim() === "") continue;
      items.push({
        fieldId: el.fieldId,
        label: el.label,
        value: displayValue(el, raw),
      });
    }
  }
  return items;
}

// set_field-time validation; the candidate is checked against the OTHER
// already-collected values so cross-field rules see real context.
export function validateCollectedField(
  contract: ServiceContract,
  field: Primitive,
  stepId: string,
  raw: string,
  currentValues: Record<string, string>,
): string | null {
  const coerced = COERCERS[field.htmlType](field, raw.trim());
  if ("error" in coerced) return coerced.error;

  const { valuesByStep } = coerceToSteps(contract, currentValues);
  const stepValues = {
    ...valuesByStep[stepId],
    [field.fieldId]: coerced.value,
  };
  valuesByStep[stepId] = stepValues;

  const messages = validateField(
    relaxOptionalIf(field, stepId, valuesByStep as StepScopedValues),
    coerced.value,
    valuesByStep as StepScopedValues,
    stepValues,
  );
  return messages[0] ?? null;
}
