import type { HtmlTypes, Primitive } from "@govtech-bb/form-types";

// Turn the raw string a user types / a pill sends into the TYPED value the
// shared validation engine + the forms API expect: dates → {day,month,year}
// parts, checkboxes/show-hide → booleans, multi-selects → value arrays, options
// → the matched option VALUE (accepting the LABEL too). Ported from the old
// app's form/values.ts (the WHAT) — without it, any form with a date or checkbox
// field fails validation or submits the wrong shape.
export type Coerced = { value: unknown } | { error: string };
type Coercer = (field: Primitive, raw: string) => Coerced;

// Date parts kept as the literal digit-strings typed (matches the forms API's
// dateValueInputSchema, #815).
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
  return field.options ? field.options.map((o) => o.value) : [];
}

// Pills send the option LABEL; accept it (case-insensitive; exact value wins) so
// "Saint Michael" records `st-michael` without a model retry.
function matchOption(field: Primitive, pick: string): string | null {
  if (!field.options) return null;
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
  return { error: "must be yes or no" };
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
  file: () => ({ error: "file fields can't be completed in chat" }),
  "show-hide": (_f, raw) => coerceBoolean(raw),
};

export function coerceValue(field: Primitive, raw: string): Coerced {
  return COERCERS[field.htmlType](field, raw);
}

// The canonical STRING to store + carry between turns: show-hide → "true"/"false"
// (the condition engine String()-compares), option fields → the value(s) (so a
// conditional sees the value, not the pill label), everything else → raw.
export function canonicalizeValue(field: Primitive, raw: string): string {
  if (field.htmlType === "show-hide") {
    const c = coerceBoolean(raw.trim());
    return "error" in c ? raw : String(c.value);
  }
  if (fieldOptions(field).length) {
    const c = COERCERS[field.htmlType](field, raw.trim());
    if ("error" in c) return raw;
    return Array.isArray(c.value)
      ? (c.value as string[]).join(",")
      : String(c.value);
  }
  return raw;
}
