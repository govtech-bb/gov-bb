import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";

export type FieldError = { field: string; message: string };
export type ValidationResult =
  | { ok: true; valuesByStep: Record<string, Record<string, unknown>> }
  | { ok: false; errors: FieldError[] };

type Coerced = { value: unknown } | { error: string };
type Coercer = (field: Primitive, raw: string) => Coerced;

function parseDate(
  raw: string,
): { day: number; month: number; year: number } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] };
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (dmy) return { day: +dmy[1], month: +dmy[2], year: +dmy[3] };
  return null;
}

function fieldOptions(field: Primitive): string[] {
  return "options" in field && field.options
    ? field.options.map((o) => o.value)
    : [];
}

function coerceEnum(field: Primitive, raw: string): Coerced {
  const valid = fieldOptions(field);
  if (!valid.includes(raw)) {
    return { error: `must be one of: ${valid.join(", ")}` };
  }
  return { value: raw };
}

function coerceCheckbox(field: Primitive, raw: string): Coerced {
  const opts = fieldOptions(field);
  if (opts.length) {
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

function isRequired(field: Primitive): boolean {
  return !!field.validations?.required;
}

function fieldIndex(
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

export function validateAndReshape(
  contract: ServiceContract,
  fields: Record<string, string>,
): ValidationResult {
  const idx = fieldIndex(contract);
  const errors: FieldError[] = [];
  const valuesByStep: Record<string, Record<string, unknown>> = {};

  for (const [fieldId, info] of idx) {
    const present = fields[fieldId] !== undefined && fields[fieldId] !== "";
    if (isRequired(info.field) && !present) {
      errors.push({ field: fieldId, message: "required" });
    }
  }

  for (const [fieldId, raw] of Object.entries(fields)) {
    const info = idx.get(fieldId);
    if (!info) {
      errors.push({ field: fieldId, message: "unknown field" });
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    const coerced = COERCERS[info.field.htmlType](info.field, trimmed);
    if ("error" in coerced) {
      errors.push({ field: fieldId, message: coerced.error });
      continue;
    }
    (valuesByStep[info.stepId] ??= {})[fieldId] = coerced.value;
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, valuesByStep };
}
