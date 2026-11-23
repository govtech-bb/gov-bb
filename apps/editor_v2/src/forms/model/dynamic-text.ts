import type { Settings } from "./settings";

export const wordingOperators = [
  "equal",
  "notEqual",
  "in",
  "exists",
  "gte",
  "lte",
  "gt",
  "lt",
] as const;

export type WordingOperator = (typeof wordingOperators)[number];

export const durationTransforms = ["yearsSince", "monthsSince", "daysSince", "daysUntil"] as const;

export type DurationTransform = (typeof durationTransforms)[number];

export type WordingLiteral = string | number | boolean | string[] | number[];

export type WordingValue = WordingLiteral | { option: string } | { options: string[] };

export type WordingVariant = {
  id: string;
  field?: string;
  operator?: WordingOperator;
  value?: WordingValue;
  text: string;
  transform?: DurationTransform;
};

export type NativeWordingCondition = {
  targetFieldId: string;
  targetStepId?: string;
  operator: WordingOperator;
  value: WordingLiteral;
  transform?: DurationTransform;
};

export type ConditionalTitle = NativeWordingCondition & { title: string };

export type ConditionalLabel = NativeWordingCondition & { label: string };

export type WordingIssue = {
  code: "dynamic-text-condition" | "dynamic-text-reference" | "dynamic-text-empty";
  message: string;
  where: string;
};

export type WordingTarget = {
  key: string;
  fieldId: string;
  stepId: string;
  kind: string;
  options: { id: string; value: string }[];
};

/** Drafts remain untouched, including missing references and incomplete rows. */
export function wordingVariants(
  settings: Settings,
  key: "conditionalTitle" | "conditionalLabel",
): WordingVariant[] {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- this preserves draft rows for repair; compileWording validates each property before emitting executable wording.
  return Array.isArray(settings[key]) ? (settings[key] as WordingVariant[]) : [];
}

function literal(value: unknown): value is WordingLiteral {
  if (typeof value === "string" || typeof value === "boolean") return true;

  if (typeof value === "number") return Number.isFinite(value);

  return (
    Array.isArray(value) &&
    (value.every((v) => typeof v === "string") ||
      value.every((v) => typeof v === "number" && Number.isFinite(v)))
  );
}

/** Resolve authoring identities only after every exported field and option value is allocated. */
export function compileWording(raw: unknown, targets: WordingTarget[], where: string) {
  const variants: (NativeWordingCondition & { text: string })[] = [];
  const issues: WordingIssue[] = [];

  if (raw === undefined) return { variants, issues };

  const issue = (code: WordingIssue["code"], message: string) =>
    issues.push({ code, message, where });

  if (!Array.isArray(raw)) {
    issue("dynamic-text-condition", "Conditional wording must be an ordered list");

    return { variants, issues };
  }

  raw.forEach((entry: unknown, index) => {
    const prefix = `Wording ${index + 1}: `;
    const before = issues.length;

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issue("dynamic-text-condition", prefix + "complete the condition");

      return;
    }

    const fieldKey = "field" in entry ? entry.field : undefined;
    const text = "text" in entry ? entry.text : undefined;
    const rawOperator = "operator" in entry ? entry.operator : undefined;
    const operator = wordingOperators.find((value) => value === rawOperator);
    const rawTransform = "transform" in entry ? entry.transform : undefined;
    const transform = durationTransforms.find((value) => value === rawTransform);
    const target = targets.find((field) => field.key === fieldKey);

    if (!target)
      issue(
        "dynamic-text-reference",
        prefix + (fieldKey ? "the referenced answer is missing" : "choose an answer"),
      );

    if (typeof text !== "string" || !text.trim())
      issue("dynamic-text-empty", prefix + "enter replacement text");

    if (operator === undefined)
      issue("dynamic-text-condition", prefix + "choose a supported operator");

    if (rawTransform !== undefined && transform === undefined)
      issue("dynamic-text-condition", prefix + "the date transform is not supported");
    let value: unknown = operator === "exists" ? true : "value" in entry ? entry.value : undefined;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const reference = value;

      const selected =
        "option" in reference && typeof reference.option === "string"
          ? [reference.option]
          : "options" in reference && Array.isArray(reference.options)
            ? reference.options
            : undefined;

      if (selected) {
        const options = selected.map((id) => target?.options.find((option) => option.id === id));

        if (target && options.some((option) => !option))
          issue("dynamic-text-reference", prefix + "a referenced option is missing");
        else if (target)
          value =
            "option" in reference && typeof reference.option === "string"
              ? options[0]?.value
              : options.map((option) => option!.value);
      }
    }

    const validLiteral = literal(value);

    if (!validLiteral) issue("dynamic-text-condition", prefix + "enter a valid comparison value");

    if (
      ["gte", "lte", "gt", "lt"].includes(operator ?? "") &&
      ((typeof value !== "number" && typeof value !== "string") ||
        value === "" ||
        !Number.isFinite(Number(value)))
    )
      issue("dynamic-text-condition", prefix + "enter a finite number for this comparison");

    if (
      issues.length !== before ||
      !target ||
      !literal(value) ||
      operator === undefined ||
      typeof text !== "string"
    )
      return;
    variants.push({
      targetFieldId: target.fieldId,
      targetStepId: target.stepId,
      operator,
      value,
      ...(transform && { transform }),
      text,
    });
  });

  return { variants, issues };
}

/** Options offered for new conditions; imported native conditions stay intact. */
export function wordingComparisons(kind: string, multiple = false): WordingOperator[] {
  if (["file-upload", "opening-hours"].includes(kind)) return ["exists"];

  if (multiple || ["checkboxes", "checkbox-accordion"].includes(kind)) return ["in", "exists"];

  if (["multiple-choice", "dropdown"].includes(kind)) return ["equal", "notEqual", "in", "exists"];

  return kind === "number"
    ? ["equal", "notEqual", "gte", "lte", "gt", "lt", "exists"]
    : ["equal", "notEqual", "exists"];
}
