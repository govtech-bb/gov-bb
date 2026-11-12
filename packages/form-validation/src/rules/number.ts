import { z } from "zod";
import type { ValidationConfig } from "@govtech-bb/form-types";
import {
  durationSince,
  durationUntil,
  type DurationUnit,
} from "@govtech-bb/expressions";
import type { RuleRunner, StepScopedValues } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

const num = (v: unknown): number => Number(v);

const TRANSFORM_UNIT: Record<string, DurationUnit> = {
  yearsSince: "years",
  monthsSince: "months",
  daysSince: "days",
  daysUntil: "days",
};

// The field's number before any `scaleBy`. With `config.transform` set, the
// field's date value is run through a duration primitive first (e.g. a DOB
// becomes a whole-year age via `yearsSince`, #1020; a future event date becomes
// a lead time in days via `daysUntil`); otherwise the raw value is coerced. The
// `*Since` transforms count backwards from today, `daysUntil` forwards to the
// date. An invalid/empty date yields NaN, which fails every bound below — the
// gating the #992 fix needs (a 1903 DOB can't satisfy `max: 24, transform:
// "yearsSince"`).
const transformed = (value: unknown, config: ValidationConfig): number => {
  if (!config.transform) return num(value);
  const unit = TRANSFORM_UNIT[config.transform];
  return config.transform === "daysUntil"
    ? durationUntil(value, unit)
    : durationSince(value, unit);
};

// The factor `config.scaleBy` picks from another answer (#3636), or 1 when the
// rule has no `scaleBy`. An empty answer is SKIP — the rule returns no error,
// the same as a missing `referenceFieldId`; the referenced field's own
// `required` rule covers it. An answer with no finite factor fails closed as
// NaN, which fails every bound: the server does not check a radio/select
// answer against its options, so a crafted answer must not skip the limit.
const SKIP = Symbol("SKIP");
const scaleFactor = (
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues?: Record<string, unknown>,
): number | typeof SKIP => {
  const { scaleBy } = config;
  if (!scaleBy) return 1;
  const answer = resolveReference(scaleBy, allValues, stepValues);
  if (
    answer === MISSING ||
    answer === undefined ||
    answer === null ||
    answer === "" ||
    (Array.isArray(answer) && answer.length === 0)
  )
    return SKIP;
  const key = String(answer);
  // hasOwnProperty, so `__proto__`/`constructor` never match a factor.
  const factor = Object.prototype.hasOwnProperty.call(scaleBy.factors, key)
    ? scaleBy.factors[key]
    : undefined;
  return Number.isFinite(factor) ? factor! : NaN;
};

// The transformed value times its `scaleBy` factor, or SKIP.
const comparand = (
  value: unknown,
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues?: Record<string, unknown>,
): number | typeof SKIP => {
  const factor = scaleFactor(config, allValues, stepValues);
  return factor === SKIP ? SKIP : transformed(value, config) * factor;
};

// Equality used by `equal` / `notEqual`. These rules apply to text fields as
// well as numbers, so compare numerically only when both sides are genuine
// numbers; otherwise fall back to a case-insensitive string comparison (the
// form client's long-standing behaviour). Coercing both sides with `Number()`
// — as this used to — turned every text-to-text comparison into `NaN === NaN`
// and silently failed, so string `equal` rules never matched.
const looseEqual = (a: unknown, b: unknown): boolean => {
  const na = Number(a);
  const nb = Number(b);
  const bothNumeric =
    a !== "" &&
    b !== "" &&
    a !== null &&
    b !== null &&
    a !== undefined &&
    b !== undefined &&
    !Number.isNaN(na) &&
    !Number.isNaN(nb);
  if (bothNumeric) return na === nb;
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
};

export const minRunner: RuleRunner = (value, config, allValues, stepValues) => {
  const min = config.value as number;
  const msg = config.error ?? `Must be at least ${min}`;
  const actual = comparand(value, config, allValues, stepValues);
  if (actual === SKIP) return null;
  const result = z.number().min(min, msg).safeParse(actual);
  return result.success ? null : msg;
};

export const maxRunner: RuleRunner = (value, config, allValues, stepValues) => {
  const max = config.value as number;
  const msg = config.error ?? `Must be at most ${max}`;
  const actual = comparand(value, config, allValues, stepValues);
  if (actual === SKIP) return null;
  const result = z.number().max(max, msg).safeParse(actual);
  return result.success ? null : msg;
};

export const gtRunner: RuleRunner = (value, config, allValues, stepValues) => {
  const msg =
    config.error ??
    `Must be greater than ${config.referenceFieldId ?? config.value}`;
  const actual = comparand(value, config, allValues, stepValues);
  if (actual === SKIP) return null;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : z.number().gt(num(config.value), msg).safeParse(actual).success
        ? null
        : msg;
  const result = z.number().gt(num(resolved), msg).safeParse(actual);
  return result.success ? null : msg;
};

export const ltRunner: RuleRunner = (value, config, allValues, stepValues) => {
  const msg =
    config.error ??
    `Must be less than ${config.referenceFieldId ?? config.value}`;
  const actual = comparand(value, config, allValues, stepValues);
  if (actual === SKIP) return null;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : z.number().lt(num(config.value), msg).safeParse(actual).success
        ? null
        : msg;
  const result = z.number().lt(num(resolved), msg).safeParse(actual);
  return result.success ? null : msg;
};

export const equalRunner: RuleRunner = (value, config, allValues) => {
  const msg =
    config.error ?? `Must equal ${config.referenceFieldId ?? config.value}`;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : looseEqual(value, config.value)
        ? null
        : msg;
  return looseEqual(value, resolved) ? null : msg;
};

export const notEqualRunner: RuleRunner = (value, config, allValues) => {
  const msg =
    config.error ?? `Must not equal ${config.referenceFieldId ?? config.value}`;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : !looseEqual(value, config.value)
        ? null
        : msg;
  return !looseEqual(value, resolved) ? null : msg;
};
