import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
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

function coerceList(field: Primitive, raw: string): Coerced {
  const opts = fieldOptions(field);
  const picks = raw.includes(",")
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [raw];
  const valid = new Set(opts);
  for (const p of picks) {
    if (!valid.has(p)) return { error: `must be one of: ${opts.join(", ")}` };
  }
  return { value: picks };
}

function coerceEnum(field: Primitive, raw: string): Coerced {
  // Multi-selects collect like option-backed checkboxes: a comma list of
  // option values.
  if (field.multiple) return coerceList(field, raw);
  const valid = fieldOptions(field);
  if (!valid.includes(raw)) {
    return { error: `must be one of: ${valid.join(", ")}` };
  }
  return { value: raw };
}

function coerceCheckbox(field: Primitive, raw: string): Coerced {
  if (fieldOptions(field).length) return coerceList(field, raw);
  const lower = raw.toLowerCase();
  if (["true", "yes", "on", "1"].includes(lower)) return { value: true };
  if (["false", "no", "off", "0", ""].includes(lower)) return { value: false };
  return { error: "must be yes/no" };
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
  // Not chat-collectable; caller already filtered. Pass through.
  file: (_f, raw) => ({ value: raw }),
  "show-hide": (_f, raw) => ({ value: raw }),
};

// Coerce every present raw value into the step-scoped shape the validation
// engine and the forms API both consume. Coercion failures are collected per
// field; other fields still coerce so cross-field rules see full context.
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

// Full-form validation before submit. Coercion first, then the shared
// @govtech-bb/form-validation engine — the same rule registry (required,
// pattern, min/max, email, cross-field dates) and the same human error
// messages the forms app shows.
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
      info.field,
      stepValues[fieldId],
      valuesByStep as StepScopedValues,
      stepValues,
    );
    for (const message of messages) errors.push({ field: fieldId, message });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, valuesByStep };
}

// Single-field validation at collection time, so set_field rejects a bad
// value the moment the model records it (and the model re-asks with the same
// message the forms app would show) instead of parking garbage in the session
// until submit. Validates the candidate against the OTHER already-collected
// values so cross-field rules (e.g. date after/before a reference field) see
// real context.
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
    field,
    coerced.value,
    valuesByStep as StepScopedValues,
    stepValues,
  );
  return messages[0] ?? null;
}
