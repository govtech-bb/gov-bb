import { z } from "zod";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";

const str = (v: unknown): string =>
  typeof v === "string" ? v : String(v ?? "");

export const minLengthRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? `Must be at least ${min} characters`;
  const result = z.string().min(min, msg).safeParse(str(value));
  return result.success ? null : msg;
};

export const maxLengthRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? `Must be at most ${max} characters`;
  const result = z.string().max(max, msg).safeParse(str(value));
  return result.success ? null : msg;
};

export const patternRunner: RuleRunner = (value, config) => {
  const pattern = config.value as string;
  const msg = config.error ?? "Invalid format";
  const result = z
    .string()
    .regex(new RegExp(pattern), msg)
    .safeParse(str(value));
  return result.success ? null : msg;
};

export const emailRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Must be a valid email address";
  const result = z.email(msg).safeParse(str(value));
  return result.success ? null : msg;
};

export const containsRunner: RuleRunner = (value, config) => {
  const needle = config.value as string;
  const msg = config.error ?? `Must contain "${needle}"`;
  const result = z
    .string()
    .includes(needle, { message: msg })
    .safeParse(str(value));
  return result.success ? null : msg;
};

export const strictEqualityRunner: RuleRunner = (value, config, allValues) => {
  const msg = config.error ?? "Values do not match";
  const resolved = resolveReference(config, allValues);
  if (resolved === MISSING)
    return config.referenceFieldId !== undefined
      ? null
      : str(value) === String(config.value ?? "")
        ? null
        : msg;
  return str(value) === String(resolved ?? "") ? null : msg;
};
