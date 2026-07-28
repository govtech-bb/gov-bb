import type {
  DateValue,
  Primitive,
  ValidationConfig,
  ValidationType,
} from "@govtech-bb/form-types";
import type { StepScopedValues } from "./types";
import { RULE_REGISTRY } from "./rules";
import { runRule } from "./rules/run-rule";
import { parseDate } from "./rules/date";
import { resolveReference, MISSING } from "./rules/resolve-reference";

/** Date input parts, in display order. */
export const DATE_PARTS = ["day", "month", "year"] as const;
export type DatePart = (typeof DATE_PARTS)[number];

/**
 * A date-field validation failure following the GOV.UK date input error
 * guidance: a single highest-priority message plus the parts of the date
 * input to highlight. `parts` containing all three parts means "highlight
 * the date input as a whole".
 */
export interface DateValidationError {
  readonly message: string;
  readonly parts: readonly DatePart[];
  /**
   * Stable reason code for analytics: `required` when nothing was entered,
   * `incomplete_date` for a partial date, `invalid_date` for an impossible
   * date, or the failing rule type (`before`/`after`/…) for a configured rule.
   * Optional so existing display consumers (which only read message/parts) are
   * unaffected.
   */
  readonly code?: string;
}

/**
 * Narrows the mixed string/structured error shape that date fields emit
 * through generic error channels (e.g. TanStack field errors).
 */
export const isDateValidationError = (e: unknown): e is DateValidationError => {
  if (typeof e !== "object" || e === null) return false;
  const { message, parts } = e as { message?: unknown; parts?: unknown };
  return typeof message === "string" && Array.isArray(parts);
};

/**
 * Returns true when `value` is the complete `{ day, month, year }` object the
 * date picker stores: all three parts present. Tolerant of both shapes during
 * the number→string parts migration (#815 / ADR 0043) — a part counts as
 * present when it is a finite number or a non-empty string.
 */
export const isCompleteDateValue = (value: unknown): value is DateValue => {
  if (typeof value !== "object" || value === null) return false;
  const { day, month, year } = value as Record<string, unknown>;
  const isFilled = (p: unknown): boolean =>
    typeof p === "number"
      ? Number.isFinite(p)
      : typeof p === "string" && p !== "";
  return isFilled(day) && isFilled(month) && isFilled(year);
};

/** Formats a date value for display, e.g. "1 September 2017". */
export const formatDateValue = ({ day, month, year }: DateValue): string =>
  formatForMessage(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
  );

const formatForMessage = (d: Date): string =>
  d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Lowercase the label's first letter for use mid-sentence ("Enter date of
 * birth"), unless it doesn't continue in lowercase ("NIS number", "D.O.B.")
 * — those are treated as proper casing and kept as-is.
 */
const asPhrase = (label: string): string =>
  /^[A-Z][a-z]/.test(label)
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : label;

// Date rules that compare against today. The highlighted area is always the
// date input as a whole.
const SIMPLE_DATE_RULES = [
  "past",
  "pastOrToday",
  "future",
  "futureOrToday",
] as const satisfies readonly ValidationType[];
type SimpleDateRule = (typeof SIMPLE_DATE_RULES)[number];

const SIMPLE_RULE_MESSAGES: Record<SimpleDateRule, (l: string) => string> = {
  past: (l) => `${l} must be in the past`,
  pastOrToday: (l) => `${l} must be today or in the past`,
  future: (l) => `${l} must be in the future`,
  futureOrToday: (l) => `${l} must be today or in the future`,
};

// Date rules that compare against another date (a literal threshold or a
// referenced field), e.g. "The date your course ends must be after
// 1 September 2017".
const COMPARISON_DATE_RULES = [
  "after",
  "onOrAfter",
  "before",
  "onOrBefore",
] as const satisfies readonly ValidationType[];
type ComparisonDateRule = (typeof COMPARISON_DATE_RULES)[number];

const COMPARISON_RULE_MESSAGES: Record<
  ComparisonDateRule,
  (l: string, d: string) => string
> = {
  after: (l, d) => `${l} must be after ${d}`,
  onOrAfter: (l, d) => `${l} must be the same as or after ${d}`,
  before: (l, d) => `${l} must be before ${d}`,
  onOrBefore: (l, d) => `${l} must be the same as or before ${d}`,
};

const isSimpleDateRule = (t: ValidationType): t is SimpleDateRule =>
  (SIMPLE_DATE_RULES as readonly ValidationType[]).includes(t);

const isComparisonDateRule = (t: ValidationType): t is ComparisonDateRule =>
  (COMPARISON_DATE_RULES as readonly ValidationType[]).includes(t);

const isPartsObject = (
  v: unknown,
): v is { day?: unknown; month?: unknown; year?: unknown } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Parts arrive as either numbers or the digit-strings the date input stores —
// tolerant during the number→string migration (#815 / ADR 0043). Parse to a
// number for the range arithmetic below; empty/absent/non-numeric → undefined
// so the incompleteness checks still fire.
const asPart = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string" || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

const joinParts = (parts: readonly DatePart[]): string => parts.join(" and ");

/**
 * Validates a date field per the GOV.UK date input error guidance, returning
 * the single highest-priority error (or null when valid). Priority order:
 *
 * 1. Missing or incomplete information — "Enter [label]" when nothing is
 *    entered (required only), "[label] must include a [day/month/year]" when
 *    partially entered, "Year must include 4 numbers".
 * 2. Information that cannot be correct — "[label] must be a real date",
 *    highlighting the impossible part (or the whole input when more than one
 *    part is wrong).
 * 3. Information that fails validation for another reason — the configured
 *    date rules (past/future/comparisons), highlighting the whole input.
 *
 * An author-configured `error` string on a rule always overrides the default
 * wording. The required rule's `error` overrides the "Enter [label]" default.
 */
export function validateDateField(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown> = {},
): DateValidationError | null {
  const { validations, label } = field;
  if (!validations) return null;

  const requiredConfig = validations["required"];
  const isRequired =
    requiredConfig !== undefined &&
    (requiredConfig.value === undefined || requiredConfig.value !== false);

  const requiredError = (): DateValidationError => ({
    message: requiredConfig?.error ?? `Enter ${asPhrase(label)}`,
    parts: DATE_PARTS,
    code: "required",
  });

  // ── Priority 1: missing or incomplete ──────────────────────────────────
  if (value === undefined || value === null || value === "") {
    return isRequired ? requiredError() : null;
  }

  // Legacy string/ISO values (stored submissions) carry no per-part
  // information — skip the incompleteness checks and parse directly.
  if (!isPartsObject(value)) {
    if (parseDate(value) === null) {
      return {
        message: `${label} must be a real date`,
        parts: DATE_PARTS,
        code: "invalid_date",
      };
    }
    return runConfiguredRules(field, value, allValues, stepValues);
  }

  const day = asPart(value.day);
  const month = asPart(value.month);
  const year = asPart(value.year);

  if (day === undefined || month === undefined || year === undefined) {
    const entered = { day, month, year };
    const missing = DATE_PARTS.filter((p) => entered[p] === undefined);
    if (missing.length === 3) {
      return isRequired ? requiredError() : null;
    }
    return {
      message: `${label} must include a ${joinParts(missing)}`,
      parts: missing,
      code: "incomplete_date",
    };
  }

  // A sensible 4-digit year: 1900–9999. Anything below reads as a too-short or
  // implausible year ("90", "925", "1899"); proper lower-bound messaging is
  // what the configurable minYear rule is for.
  if (year < 1900 || year > 9999) {
    return {
      message: "Year must include 4 numbers",
      parts: ["year"],
      code: "incomplete_date",
    };
  }

  // ── Priority 2: information that cannot be correct ─────────────────────
  const badParts: DatePart[] = [];
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    badParts.push("month");
  }
  // Days in the entered month (or the most permissive bound when the month
  // itself is impossible, so a plausible day isn't flagged alongside it).
  const maxDay =
    badParts.length > 0 ? 31 : new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    badParts.push("day");
  }
  if (badParts.length > 0) {
    return {
      message: `${label} must be a real date`,
      // Whole input when more than one part is wrong (per the guidance).
      parts: badParts.length > 1 ? DATE_PARTS : badParts,
      code: "invalid_date",
    };
  }

  // ── Priority 3: everything else (configured rules) ─────────────────────
  return runConfiguredRules(field, value, allValues, stepValues);
}

function runConfiguredRules(
  field: Primitive,
  value: unknown,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown>,
): DateValidationError | null {
  const { validations, label } = field;
  if (!validations) return null;

  for (const [type, config] of Object.entries(validations) as [
    ValidationType,
    ValidationConfig | undefined,
  ][]) {
    if (type === "required" || type === "conditionalOn") continue;
    const runner = RULE_REGISTRY[type];
    if (!runner || !config) continue;

    const patched =
      config.error !== undefined
        ? config
        : {
            ...config,
            error: defaultRuleMessage(
              type,
              label,
              config,
              allValues,
              stepValues,
            ),
          };

    const msg = runRule(runner, value, patched, allValues, stepValues);
    if (msg !== null) return { message: msg, parts: DATE_PARTS, code: type };
  }

  return null;
}

// GOV.UK default wording for a date rule, or undefined to keep the runner's
// own default (minYear/maxYear and any non-date rules).
function defaultRuleMessage(
  type: ValidationType,
  label: string,
  config: ValidationConfig,
  allValues: StepScopedValues,
  stepValues: Record<string, unknown>,
): string | undefined {
  if (isSimpleDateRule(type)) return SIMPLE_RULE_MESSAGES[type](label);
  if (!isComparisonDateRule(type)) return undefined;

  const target =
    config.referenceFieldId !== undefined
      ? resolveReference(config, allValues, stepValues)
      : config.value;
  if (target === MISSING) return undefined; // rule will be skipped anyway

  const targetDate = parseDate(target);
  return COMPARISON_RULE_MESSAGES[type](
    label,
    targetDate ? formatForMessage(targetDate) : String(target),
  );
}
