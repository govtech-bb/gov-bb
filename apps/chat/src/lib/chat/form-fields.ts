import type {
  HtmlTypes,
  Primitive,
  ServiceContract,
} from "@govtech-bb/form-types";
import { getFormDefinition } from "./form-api";

// htmlTypes the chat LLM cannot meaningfully collect (binary/UI controls);
// the user completes these on the form review page.
const UNCOLLECTABLE: ReadonlySet<HtmlTypes> = new Set<HtmlTypes>([
  "file",
  "show-hide",
]);

function hasConditionalOrRepeatableBehaviour(field: Primitive): boolean {
  const bs = field.behaviours;
  if (!bs?.length) return false;
  return bs.some(
    (b) =>
      b.type === "fieldConditionalOn" ||
      b.type === "repeatable" ||
      b.type === "fieldArray",
  );
}

function isRequired(field: Primitive): boolean {
  return !!field.validations?.required;
}

function describeField(field: Primitive): string {
  const req = isRequired(field) ? "required" : "optional";
  const opts =
    "options" in field && field.options?.length
      ? ` [${field.options.map((o) => o.value).join("|")}]`
      : "";
  // fieldId is the canonical submission key (see form-builder concat helper).
  return `- ${field.fieldId}: ${field.htmlType} (${req})${opts}  // ${field.label}`;
}

function summarize(contract: ServiceContract): string | null {
  const lines: string[] = [];
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (el.isHidden) continue;
      if (UNCOLLECTABLE.has(el.htmlType)) continue;
      if (hasConditionalOrRepeatableBehaviour(el)) continue;
      lines.push(describeField(el));
    }
  }
  if (!lines.length) return null;
  return [`Form: ${contract.title} (${contract.formId})`, "", ...lines].join(
    "\n",
  );
}

export async function summarizeFormFields(
  slug: string,
): Promise<string | null> {
  const def = await getFormDefinition(slug);
  if (!def) return null;
  return summarize(def);
}
