import { z } from "zod";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

const num = (v: unknown): number => Number(v);

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
      : num(value) === num(config.value)
        ? null
        : msg;
  return num(value) === num(resolved) ? null : msg;
};

export const notEqualRunner: RuleRunner = (value, config, allValues) => {
  const msg =
    config.error ?? `Must not equal ${config.referenceFieldId ?? config.value}`;
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : num(value) !== num(config.value)
        ? null
        : msg;
  return num(value) !== num(resolved) ? null : msg;
};
