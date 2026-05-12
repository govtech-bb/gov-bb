import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

const parseDate = (v: unknown): Date | null => {
  if (!v) return null;
  // Handle DateValue object format: { day, month, year }
  if (typeof v === "object" && "day" in v && "month" in v && "year" in v) {
    const obj = v as { day: number; month: number; year: number };
    if (!obj.day || !obj.month || !obj.year) return null;
    const d = new Date(Date.UTC(obj.year, obj.month - 1, obj.day));
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== "string") return null;
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
