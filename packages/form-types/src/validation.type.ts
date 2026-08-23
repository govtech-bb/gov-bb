import { z } from "zod";
import { durationTransformSchema } from "./behavior.type";

export const validationConfigSchema = z.object({
  error: z.string().optional(),
  value: z.any().optional(),
  targetStepId: z.string().optional(),
  referenceFieldId: z.string().optional(),
  referenceStepId: z.string().optional(),
  // Optional date→number derivation (#1020). When set on a numeric rule
  // (`min`/`max`/`gt`/`lt`), the field's date value is passed through
  // `durationSince` before the bound is checked — e.g. `min: 16` +
  // `transform: "yearsSince"` on a date-of-birth field enforces a minimum age.
  // Invalid/empty date → NaN → the bound fails (validation-fail).
  transform: durationTransformSchema.optional(),
  // When true on a `minYear`/`maxYear` rule, the bound resolves to the current
  // year at validation time instead of a literal `value` — e.g. a "Year" field
  // that must not be in the future. Resolved fresh on every run, so it never
  // goes stale the way a hardcoded year would.
  currentYear: z.boolean().optional(),
  // Shifts the resolved reference date forward by N calendar months on the
  // cross-field date rules (`after`/`before`/`onOrAfter`/`onOrBefore`), so the
  // bound becomes "reference + N months" — e.g. an end date that must be on or
  // before the start date plus 6 months. Day-of-month clamps to the target
  // month's last day (31 Aug + 6 → 28/29 Feb). Ignored by non-date rules.
  offsetMonths: z.number().optional(),
});
export type ValidationConfig = z.infer<typeof validationConfigSchema>;

export const validationTypeSchema = z.enum([
  "required",
  "minLength",
  "maxLength",
  "pattern",
  "min",
  "max",
  "conditionalOn",
  "past",
  "pastOrToday",
  "future",
  "futureOrToday",
  "after",
  "before",
  "onOrAfter",
  "onOrBefore",
  "minYear",
  "maxYear",
  "minItems",
  "maxItems",
  "radio",
  "minSelection",
  "maxSelection",
  "email",
  "phone",
  "fileTypes",
  "itemMaxSize",
  "maxSize",
  "equal",
  "notEqual",
  "gt",
  "lt",
  "contains",
  "strictEquality",
]);
export type ValidationType = z.infer<typeof validationTypeSchema>;

export const validationRuleSchema = z.partialRecord(
  validationTypeSchema,
  validationConfigSchema,
);
export type ValidationRule = z.infer<typeof validationRuleSchema>;

// Per-rule `value` contracts (#2384). `validationConfigSchema.value` is
// `z.any()` because one config shape is shared by every rule type, so nothing
// stopped a builder-authored comma string from landing in `fileTypes.value`
// and crashing the forms renderer at `rawFileTypes.map(...)`. These pin the
// shapes the rule runners in @govtech-bb/form-validation actually consume.
// Rules absent from this map keep the loose `any`: their runners compare
// against arbitrary scalars (`equal`, `contains`), or the rule is a marker
// whose presence alone is the rule (`email`, `phone`).
const ruleValueSchemas = {
  required: z.boolean(),
  minLength: z.number(),
  maxLength: z.number(),
  minItems: z.number(),
  maxItems: z.number(),
  minSelection: z.number(),
  maxSelection: z.number(),
  min: z.number(),
  max: z.number(),
  gt: z.number(),
  lt: z.number(),
  minYear: z.number(),
  maxYear: z.number(),
  itemMaxSize: z.number(),
  maxSize: z.number(),
  fileTypes: z.array(z.string()),
  pattern: z.string(),
} satisfies Partial<Record<ValidationType, z.ZodType>>;

/**
 * Report every rule whose `value` does not match the shape its runner consumes.
 *
 * Deliberately NOT enforced by `validationRuleSchema` itself: that leaf is
 * shared by the served-contract schema, and `apps/forms` hard-parses every API
 * response with `serviceContractSchema.parse(...)`. Rejecting there would turn
 * one bad value into a blank "Something went wrong" for the WHOLE form — a
 * worse version of the #2384 crash — and it would break the moment a new
 * frontend met an API still serving an older recipe. So the strict gate is
 * applied to recipes only (authored artifacts, gated by CI `validate-recipes`,
 * the API recipe loader and the builder's draft save), while the runtime read
 * path stays tolerant and normalises bad values at the point of use.
 */
/**
 * Coerce a rule `value` the builder wrote as raw text into the shape its runner
 * consumes — `fileTypes` from a comma string to `string[]`, numeric rules from
 * a numeric string to a number.
 *
 * The builder's Value box is a text input, so this is the choke point that
 * stops it re-emitting a legacy off-shape value: the editor only converts what
 * the author actually retypes, so a recipe carrying an old string that nobody
 * touched would otherwise survive a full round-trip unchanged (#2384).
 *
 * A value that cannot be coerced (e.g. `minLength: "abc"`) is left exactly as
 * it is, so `ruleValueIssues` still reports it rather than storing a NaN.
 */
export function normalizeRuleValues(
  validations: ValidationRule,
): ValidationRule {
  const normalized: Record<string, unknown> = { ...validations };
  for (const [type, config] of Object.entries(validations)) {
    const valueSchema = ruleValueSchemas[type as keyof typeof ruleValueSchemas];
    if (!valueSchema || config?.value === undefined) continue;
    if (valueSchema.safeParse(config.value).success) continue;

    if (type === "fileTypes" && typeof config.value === "string") {
      normalized[type] = {
        ...config,
        value: config.value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
      continue;
    }
    if (typeof config.value === "string") {
      const parsed = Number(config.value);
      if (config.value.trim() !== "" && Number.isFinite(parsed)) {
        normalized[type] = { ...config, value: parsed };
      }
    }
  }
  return normalized as ValidationRule;
}

export function ruleValueIssues(validations: ValidationRule): string[] {
  const issues: string[] = [];
  for (const [type, config] of Object.entries(validations)) {
    const valueSchema = ruleValueSchemas[type as keyof typeof ruleValueSchemas];
    // A rule may legitimately carry no `value`: `gt`/`lt` bound by
    // `referenceFieldId`, `minYear`/`maxYear` bound by `currentYear`, or a
    // rule reduced to just its `error` copy.
    if (!valueSchema || config?.value === undefined) continue;
    const result = valueSchema.safeParse(config.value);
    if (!result.success) {
      issues.push(
        `${type}.value: ${result.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
  }
  return issues;
}

// Date parts are migrating from numbers to the literal digit-string the user
// typed (so "09" no longer collapses to "9" and "00" stays distinct from "0").
// Because the forms frontend and the API deploy separately, the shape is
// tolerated as EITHER during the migration window: the validation boundary in
// `@govtech-bb/form-validation` coerces both to a number where arithmetic is
// needed (ADR 0040 / 0043). The frontend flips to emitting strings in a later
// deploy. See issue #815.
export const dateValueInputSchema = z.object({
  day: z.union([z.number(), z.string()]).optional(),
  month: z.union([z.number(), z.string()]).optional(),
  year: z.union([z.number(), z.string()]).optional(),
});

export type DateValueInput = z.infer<typeof dateValueInputSchema>;

export interface DateValue {
  day: string | number;
  month: string | number;
  year: string | number;
}

export const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
  dateValueInputSchema,
]);

export type FieldValue = z.infer<typeof fieldValueSchema>;
