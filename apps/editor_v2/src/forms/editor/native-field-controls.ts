import { $getRoot, type LexicalNode } from "lexical";
import { $setSettings } from "../../editor/core/document-state";
import type { NativeScalar, ValidationRule } from "../schema/types";
import type { ErrorMessage, RuleName } from "../adapters/ssb/rules";
import { defaultMessage } from "./ssb";
import { $native, $setNative, type NativeNodeData } from "./native-state";
import { nativeQuestionSettings } from "./native-settings";

type Question = NonNullable<NativeNodeData["question"]>;

type MessageContext = { kind: string; label: string; optionCount: number };

export type NativeErrorMessage = Omit<ErrorMessage, "rule"> & {
  native: true;
  rule: string;
  required?: boolean;
  format?: "email" | "phone";
};

const ruleLabels: Record<ValidationRule["type"], string> = {
  minLength: "Minimum length",
  maxLength: "Maximum length",
  minimum: "Minimum value",
  maximum: "Maximum value",
  minAge: "Minimum age",
  maxAge: "Maximum age",
  minSelections: "Minimum choices",
  maxSelections: "Maximum choices",
  minFiles: "Minimum files",
  maxFiles: "Maximum files",
  maxFileSize: "Maximum file size",
  fileTypes: "File types",
  pattern: "Format",
  integer: "Whole number",
  email: "Email address",
  phone: "Telephone number",
  equals: "Expected answer",
  dateBefore: "Latest date",
  dateAfter: "Earliest date",
  dateIn: "Permitted dates",
};

function ruleDefault(rule: ValidationRule, context: MessageContext): string {
  const answer = context.label.trim() || "Your answer";

  switch (rule.type) {
    case "integer":
      return `${answer} must be a whole number`;
    case "equals":
      return `${answer} must be ${rule.value}`;
    case "minAge":
      return `${answer} must be ${rule.value} years or older`;
    case "maxAge":
      return `${answer} must be ${rule.value} years or younger`;
    case "minimum":
    case "maximum":
      return rule.inclusive === false
        ? `${answer} must be ${rule.type === "minimum" ? "more" : "less"} than ${rule.value}`
        : defaultMessage(rule.type === "minimum" ? "min" : "max", {
            ...context,
            value: rule.value,
          });
    case "dateIn":
      return `${answer} must be one of the permitted dates`;
    case "dateBefore":
    case "dateAfter": {
      const before = rule.type === "dateBefore";

      const today =
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Native date expressions are a typed scalar/reference/operator union; only a context reference can denote today.
        typeof rule.value === "object" && "context" in rule.value && rule.value.context === "today";

      const name: RuleName = today
        ? before
          ? rule.inclusive
            ? "pastOrToday"
            : "past"
          : rule.inclusive
            ? "futureOrToday"
            : "future"
        : before
          ? rule.inclusive
            ? "onOrBefore"
            : "before"
          : rule.inclusive
            ? "onOrAfter"
            : "after";

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A fixed date can be formatted directly; other typed expressions need a general date message.
      return typeof rule.value === "string" || today
        ? defaultMessage(name, { ...context, value: today ? undefined : rule.value })
        : `${answer} must be ${rule.inclusive ? "on or " : ""}${before ? "before" : "after"} the permitted date`;
    }

    default: {
      const names = {
        minLength: "minLength",
        maxLength: "maxLength",
        minSelections: "minSelection",
        maxSelections: "maxSelection",
        minFiles: "minItems",
        maxFiles: "maxItems",
        maxFileSize: "itemMaxSize",
        fileTypes: "fileTypes",
        pattern: "pattern",
        email: "email",
        phone: "phone",
      } as const;

      return defaultMessage(names[rule.type], {
        ...context,
        value: rule.type === "pattern" ? rule.pattern : "value" in rule ? rule.value : undefined,
      });
    }
  }
}

export function nativeErrorMessages(
  question: Question,
  context: MessageContext,
): NativeErrorMessage[] {
  const messages: NativeErrorMessage[] = (question.validation ?? []).map((rule) => {
    const fallback = ruleDefault(rule, context);

    return {
      native: true,
      rule: rule.id,
      label: ruleLabels[rule.type],
      message: rule.message || fallback,
      default: fallback,
      pinned: !!rule.message.trim() && rule.message !== fallback,
    };
  });

  if (
    (question.kind === "email" || question.kind === "phone") &&
    !question.validation?.some((rule) => rule.type === question.kind)
  ) {
    const fallback = defaultMessage(question.kind, context);
    let id = `${question.id}-${question.kind}`;
    let suffix = 2;

    while (question.validation?.some((rule) => rule.id === id))
      id = `${question.id}-${question.kind}-${suffix++}`;

    messages.push({
      native: true,
      rule: id,
      format: question.kind,
      label: ruleLabels[question.kind],
      message: fallback,
      default: fallback,
      pinned: false,
    });
  }

  if (question.required?.value) {
    const fallback = defaultMessage("required", context);
    messages.unshift({
      native: true,
      rule: "required",
      required: true,
      label: "Required",
      message: question.required.message || fallback,
      default: fallback,
      pinned: !!question.required.message.trim() && question.required.message !== fallback,
    });
  }

  return messages;
}

export function $setNativeErrorMessage(
  node: LexicalNode,
  error: NativeErrorMessage,
  text: string | undefined,
) {
  const question = $native(node).question;

  if (!question) return;
  const message = text?.trim() ? text : error.default;

  const next: Question = {
    ...question,
    ...(error.required && question.required
      ? { required: { ...question.required, message } }
      : {
          validation:
            error.format && !question.validation?.some((rule) => rule.id === error.rule)
              ? [...(question.validation ?? []), { id: error.rule, type: error.format, message }]
              : question.validation?.map((rule) =>
                  rule.id === error.rule ? { ...rule, message } : rule,
                ),
        }),
  };

  for (const member of $getRoot().getChildren())
    if ($native(member).question?.id === question.id) {
      $setNative(member, { question: next });
      $setSettings(member, { errors: nativeQuestionSettings(next).errors });
    }
}

export function parseOptionValue(text: string, previous: NativeScalar): NativeScalar | undefined {
  if (!text.trim()) return undefined;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Parse the text-input boundary according to the option's existing native scalar type.
  if (typeof previous === "number") {
    const value = Number(text);

    return Number.isFinite(value) ? value : undefined;
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Boolean options accept their two literal values without changing the native scalar type.
  if (typeof previous === "boolean")
    return text === "true" ? true : text === "false" ? false : undefined;

  return text;
}

export function optionValueError(text: string, previous: NativeScalar): string | null {
  if (!text.trim()) return "Enter an option value";

  if (parseOptionValue(text, previous) !== undefined) return null;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Invalid text receives the message for its existing native scalar type.
  return typeof previous === "number" ? "Enter a number" : "Enter true or false";
}
