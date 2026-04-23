import { z } from "zod";
import type { RuleRunner } from "../types";

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const minItemsRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? `Must have at least ${min} item(s)`;
  const result = z.array(z.unknown()).min(min, msg).safeParse(arr(value));
  return result.success ? null : msg;
};

export const maxItemsRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? `Must have at most ${max} item(s)`;
  const result = z.array(z.unknown()).max(max, msg).safeParse(arr(value));
  return result.success ? null : msg;
};

export const minSelectionRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? `Select at least ${min} option(s)`;
  const result = z.array(z.unknown()).min(min, msg).safeParse(arr(value));
  return result.success ? null : msg;
};

export const maxSelectionRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? `Select at most ${max} option(s)`;
  const result = z.array(z.unknown()).max(max, msg).safeParse(arr(value));
  return result.success ? null : msg;
};

export const radioRunner: RuleRunner = (value, config) => {
  const allowed = config.value as string[];
  const msg = config.error ?? "Invalid selection";
  if (!Array.isArray(allowed)) return null;
  const result = z
    .enum(allowed as [string, ...string[]], { message: msg })
    .safeParse(value);
  return result.success ? null : msg;
};
