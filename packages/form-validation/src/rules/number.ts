import { z } from "zod";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

const num = (v: unknown): number => Number(v);

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

export const minRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? `Must be at least ${min}`;
  const result = z.number().min(min, msg).safeParse(num(value));
  return result.success ? null : msg;
};

export const maxRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? `Must be at most ${max}`;
  const result = z.number().max(max, msg).safeParse(num(value));
  return result.success ? null : msg;
};

export const gtRunner: RuleRunner = (value, config, allValues) => {
  const msg =
    config.error ??
    `Must be greater than ${config.referenceFieldId ?? config.value}`;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : z.number().gt(num(config.value), msg).safeParse(num(value)).success
        ? null
        : msg;
  const result = z.number().gt(num(resolved), msg).safeParse(num(value));
  return result.success ? null : msg;
};

export const ltRunner: RuleRunner = (value, config, allValues) => {
  const msg =
    config.error ??
    `Must be less than ${config.referenceFieldId ?? config.value}`;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : z.number().lt(num(config.value), msg).safeParse(num(value)).success
        ? null
        : msg;
  const result = z.number().lt(num(resolved), msg).safeParse(num(value));
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
