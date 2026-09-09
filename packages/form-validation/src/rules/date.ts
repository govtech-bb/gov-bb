import { DateTime } from "luxon";
import { DEFAULT_ZONE, parseDateValue } from "@govtech-bb/expressions";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

// Parse a date value (object / DD/MM/YYYY / ISO) into a UTC-midnight `Date` for
// the day-granular comparison rules below. The parsing + validation is shared
// via `parseDateValue` (#2072); we anchor the result at UTC midnight here to
// match `today()` — see its note on why UTC (not Barbados) midnight.
export const parseDate = (v: unknown): Date | null => {
  const parts = parseDateValue(v);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
};

// "Today" as the Barbados calendar date (DEFAULT_ZONE), anchored at UTC midnight
// so it matches how parseDate stores submitted dates. This keeps the day
// comparisons below correct and in step with age-gating / conditional-visibility
// / the today() expression, which all compute "today" in America/Barbados (#1825).
// Anchoring at UTC midnight — not Barbados midnight — is deliberate: submitted
// dates are UTC-midnight anchored, so DateTime.startOf("day").toJSDate() (= 04:00
// UTC) would skew every < / > comparison by 4 hours.
const today = (): Date => {
  const now = DateTime.now().setZone(DEFAULT_ZONE);
  return new Date(Date.UTC(now.year, now.month - 1, now.day));
};

export const pastRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Date must be in the past";
  const d = parseDate(value);
  if (!d) return msg;
  return d < today() ? null : msg;
};

export const pastOrTodayRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Date must be today or in the past";
  const d = parseDate(value);
  if (!d) return msg;
  return d <= today() ? null : msg;
};

export const futureRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Date must be in the future";
  const d = parseDate(value);
  if (!d) return msg;
  return d > today() ? null : msg;
};

export const futureOrTodayRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Date must be today or in the future";
  const d = parseDate(value);
  if (!d) return msg;
  return d >= today() ? null : msg;
};

function resolveDateRef(
  config: Parameters<RuleRunner>[1],
  allValues: Parameters<RuleRunner>[2],
): unknown {
  const resolved = resolveReference(config, allValues);
  return resolved === MISSING ? config.value : resolved;
}

// Add `months` calendar months to a UTC date, clamping the day to the target
// month's last day so 31 Aug + 6 → 28 Feb (not 3 Mar) — the conventional
// behaviour for a "+N months" upper bound (matches date-fns addMonths).
const addMonths = (date: Date, months: number): Date => {
  const shifted = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return shifted;
};

// Parse the resolved reference, then shift it forward by config.offsetMonths
// when set, so cross-field date rules can compare against "reference + N
// months". A null parse or absent offset returns the date unchanged.
const parseRef = (
  target: unknown,
  config: Parameters<RuleRunner>[1],
): Date | null => {
  const ref = parseDate(target);
  return ref && typeof config.offsetMonths === "number"
    ? addMonths(ref, config.offsetMonths)
    : ref;
};

export const afterRunner: RuleRunner = (value, config, allValues) => {
  const target = resolveDateRef(config, allValues);
  if (
    resolveReference(config, allValues) === MISSING &&
    config.referenceFieldId !== undefined
  )
    return null;
  const msg =
    config.error ??
    `Date must be after ${config.referenceFieldId ?? config.value}`;
  const d = parseDate(value);
  const ref = parseRef(target, config);
  if (!d || !ref) return msg;
  return d > ref ? null : msg;
};

export const beforeRunner: RuleRunner = (value, config, allValues) => {
  if (
    resolveReference(config, allValues) === MISSING &&
    config.referenceFieldId !== undefined
  )
    return null;
  const target = resolveDateRef(config, allValues);
  const msg =
    config.error ??
    `Date must be before ${config.referenceFieldId ?? config.value}`;
  const d = parseDate(value);
  const ref = parseRef(target, config);
  if (!d || !ref) return msg;
  return d < ref ? null : msg;
};

export const onOrAfterRunner: RuleRunner = (value, config, allValues) => {
  if (
    resolveReference(config, allValues) === MISSING &&
    config.referenceFieldId !== undefined
  )
    return null;
  const target = resolveDateRef(config, allValues);
  const msg =
    config.error ??
    `Date must be on or after ${config.referenceFieldId ?? config.value}`;
  const d = parseDate(value);
  const ref = parseRef(target, config);
  if (!d || !ref) return msg;
  return d >= ref ? null : msg;
};

export const onOrBeforeRunner: RuleRunner = (value, config, allValues) => {
  if (
    resolveReference(config, allValues) === MISSING &&
    config.referenceFieldId !== undefined
  )
    return null;
  const target = resolveDateRef(config, allValues);
  const msg =
    config.error ??
    `Date must be on or before ${config.referenceFieldId ?? config.value}`;
  const d = parseDate(value);
  const ref = parseRef(target, config);
  if (!d || !ref) return msg;
  return d <= ref ? null : msg;
};

// Extract a 4-digit year from either a date value (date fields) or a bare year
// (number fields store a plain number or numeric string). Returns null when the
// value yields no usable year, so the caller can fail the rule.
const toYear = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\s*\d{4}\s*$/.test(value))
    return Number(value.trim());
  const d = parseDate(value);
  return d ? d.getUTCFullYear() : null;
};

// The year bound is the literal `value`, unless `currentYear` is set — then it
// resolves to the current year at validation time (see validation.type.ts).
const yearBound = (config: Parameters<RuleRunner>[1]): number =>
  config.currentYear === true
    ? today().getUTCFullYear()
    : (config.value as number);

export const minYearRunner: RuleRunner = (value, config) => {
  const minYear = yearBound(config);
  const msg = config.error ?? `Year must be ${minYear} or later`;
  const year = toYear(value);
  if (year === null) return msg;
  return year >= minYear ? null : msg;
};

export const maxYearRunner: RuleRunner = (value, config) => {
  const maxYear = yearBound(config);
  const msg = config.error ?? `Year must be ${maxYear} or earlier`;
  const year = toYear(value);
  if (year === null) return msg;
  return year <= maxYear ? null : msg;
};
