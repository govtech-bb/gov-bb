import { z } from "zod";
import { isAllBlankStringArray } from "@govtech-bb/form-types";
import { defaultValidationMessage } from "../default-messages";
import type { RuleRunner } from "../types";

export const requiredRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? defaultValidationMessage("required");
  const schema = z.any().refine((v) => {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    // An array must hold at least one real entry: rows added but left blank
    // ([""]) are no answer (shared semantics with valueIsEmpty).
    if (Array.isArray(v)) return v.length > 0 && !isAllBlankStringArray(v);
    return true;
  }, msg);
  const result = schema.safeParse(value);
  return result.success ? null : msg;
};
