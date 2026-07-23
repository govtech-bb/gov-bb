import { z } from "zod";
import { defaultValidationMessage } from "../default-messages";
import type { RuleRunner } from "../types";
import { resolveReference, MISSING } from "./resolve-reference";
import { str, forEachString } from "./string-values";

export const minLengthRunner: RuleRunner = (value, config) => {
  const min = config.value as number;
  const msg = config.error ?? defaultValidationMessage("minLength", config);
  return forEachString(value, (element) =>
    z.string().min(min, msg).safeParse(str(element)).success ? null : msg,
  );
};

export const maxLengthRunner: RuleRunner = (value, config) => {
  const max = config.value as number;
  const msg = config.error ?? defaultValidationMessage("maxLength", config);
  return forEachString(value, (element) =>
    z.string().max(max, msg).safeParse(str(element)).success ? null : msg,
  );
};

export const patternRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? defaultValidationMessage("pattern");
  // A misconfigured pattern rule fails closed rather than crashing the
  // validation loop (invalid regex) or silently passing everything
  // (undefined value becomes /(?:)/).
  if (typeof config.value !== "string" || config.value === "") return msg;
  let re: RegExp;
  try {
    // `u` (Unicode) mode so patterns can use `\p{L}`/`\p{M}` property escapes
    // (e.g. the person-name pattern accepting any-script letters, #1843).
    // Every builtin + committed-recipe pattern was checked to compile under `u`;
    // DB-stored custom-component patterns and future recipe-authored patterns are
    // NOT audited here, so a `u`-incompatible one (e.g. an identity escape like
    // `\-` outside a class, or a literal `{`) will throw and fail closed via the
    // catch below — rejecting that field's input rather than crashing.
    re = new RegExp(config.value, "u");
  } catch {
    return msg;
  }
  return forEachString(value, (element) =>
    re.test(str(element)) ? null : msg,
  );
};

export const emailRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? defaultValidationMessage("email");
  return forEachString(value, (element) =>
    z.email(msg).safeParse(str(element)).success ? null : msg,
  );
};

export const containsRunner: RuleRunner = (value, config) => {
  const needle = config.value as string;
  const msg = config.error ?? defaultValidationMessage("contains", config);
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
