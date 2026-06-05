import { z } from "zod";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";
import { str, forEachString } from "./string-values";

export const minLengthRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? `Must be at least ${min} characters`;
  return forEachString(value, (element) =>
    z.string().min(min, msg).safeParse(str(element)).success ? null : msg,
  );
};

export const maxLengthRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? `Must be at most ${max} characters`;
  return forEachString(value, (element) =>
    z.string().max(max, msg).safeParse(str(element)).success ? null : msg,
  );
};

export const patternRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Invalid format";
  // A misconfigured pattern rule fails closed rather than crashing the
  // validation loop (invalid regex) or silently passing everything
  // (undefined value becomes /(?:)/).
  if (typeof config.value !== "string" || config.value === "") return msg;
  let re: RegExp;
  try {
    re = new RegExp(config.value);
  } catch {
    return msg;
  }
  return forEachString(value, (element) =>
    re.test(str(element)) ? null : msg,
  );
};

export const emailRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Must be a valid email address";
  return forEachString(value, (element) =>
    z.email(msg).safeParse(str(element)).success ? null : msg,
  );
};

export const containsRunner: RuleRunner = (value, config) => {
  const needle = config.value as string;
  const msg = config.error ?? `Must contain "${needle}"`;
  return forEachString(value, (element) =>
    z.string().includes(needle, { message: msg }).safeParse(str(element))
      .success
      ? null
      : msg,
  );
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
  // A null/undefined resolved reference is a distinct non-value: don't let it
  // collapse to "" and trivially match a blank field (that's required's job).
  if (resolved === null || resolved === undefined) return msg;
  return str(value) === String(resolved) ? null : msg;
};
