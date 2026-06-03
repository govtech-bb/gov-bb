import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

export const parseDate = (v: unknown): Date | null => {
  if (!v) return null;
  // Handle DateValue object format: { day, month, year }
  if (typeof v === "object" && "day" in v && "month" in v && "year" in v) {
    const obj = v as { day: number; month: number; year: number };
    if (!obj.day || !obj.month || !obj.year) return null;
    const d = new Date(Date.UTC(obj.year, obj.month - 1, obj.day));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== "string") return null;
  // A `/`-separated literal is the Barbados DD/MM/YYYY format author-typed in
  // the form-builder threshold editor. Parse it day-first to match the old
  // client (and the locale). ISO strings use `-`, so the two never collide;
  // anything without `/` falls through to native parsing, preserving the ISO
  // path that apps/api relies on for submitted/stored date values.
  if (v.includes("/")) {
    const parts = v.split("/");
    if (parts.length !== 3) return null;
    const [dayStr, monthStr, yearStr] = parts;
    // Require plain digit runs (DD/MM/YYYY, year exactly 4 digits). This rejects
    // the non-canonical numerics `Number` would otherwise swallow — hex
    // (`0x10`), floats (`12.5`), whitespace-padded (` 5 `) — and short/typo
    // years that would silently map into the 1900s.
    if (
      !/^\d{1,2}$/.test(dayStr!) ||
      !/^\d{1,2}$/.test(monthStr!) ||
      !/^\d{4}$/.test(yearStr!)
    )
      return null;
    const day = Number(dayStr);
    const month = Number(monthStr);
    const year = Number(yearStr);
    const d = new Date(Date.UTC(year, month - 1, day));
    // `Date.UTC` normalises out-of-range components (`31/02` → 2 Mar), so a bad
    // threshold would otherwise become a plausible-but-wrong boundary. Reject
    // anything that doesn't round-trip.
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    )
      return null;
    return d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const today = (): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
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
  const ref = parseDate(target);
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
  const ref = parseDate(target);
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
  const ref = parseDate(target);
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
  const ref = parseDate(target);
  if (!d || !ref) return msg;
  return d <= ref ? null : msg;
};

export const minYearRunner: RuleRunner = (value, config) => {
  const minYear = config.value as number;
  const msg = config.error ?? `Year must be ${minYear} or later`;
  const d = parseDate(value);
  if (!d) return msg;
  return d.getUTCFullYear() >= minYear ? null : msg;
};

export const maxYearRunner: RuleRunner = (value, config) => {
  const maxYear = config.value as number;
  const msg = config.error ?? `Year must be ${maxYear} or earlier`;
  const d = parseDate(value);
  if (!d) return msg;
  return d.getUTCFullYear() <= maxYear ? null : msg;
};
