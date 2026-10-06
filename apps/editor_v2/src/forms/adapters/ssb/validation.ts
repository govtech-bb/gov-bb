import type { LegacySsbFormSchema as FormSchema, FormQuestion, FormPage } from "./schema";
import type { ActionType } from "../../core/logic";
import type { FieldIssue } from "../../core/fields";
import type { Settings } from "../../core/settings";
import { checkId, RESERVED_PAGE_IDS } from "../../core/identities";
import { isFieldless } from "./rules";
import { formSettingsIssues } from "./form-settings";
import { logicAgeIssues } from "./logic-age";
import { unavailableLogicActions } from "./logic-actions";
import { repeatIssues } from "./repetition";
import { nestingIssues } from "./nesting";

/** Only output validation contributions; no editor, renderer or preset is needed. */
export type SsbValidationDefinition = {
  readonly fields: readonly {
    readonly kind: string;
    readonly capabilities: { readonly repeat: boolean };
    readonly validate: (settings: Settings, where: string) => FieldIssue[];
    readonly legacySsb?: { readonly validateOutput?: (question: FormQuestion) => FieldIssue[] };
  }[];
  readonly logicActions: readonly { readonly type: ActionType }[];
};

/** SSB's publish gates, checked on the form that will be exported. */
export function preflight(
  schema: FormSchema,
  definition: SsbValidationDefinition,
): { code: string; message: string; where: string }[] {
  const issues: { code: string; message: string; where: string }[] = [];
  const fields = new Set<string>();
  const pages = new Set<string>();
  const types = new Set<FormPage["pageType"]>();
  const order = { questions: 0, "check-answers": 1, declaration: 2, confirmation: 3 };
  let lastOrder = 0;
  let orderError: string | undefined;
  let confirmation = false;

  for (const page of schema.pages) {
    const fixedId =
      page.pageType === "check-answers"
        ? "check-your-answers"
        : page.pageType === "declaration"
          ? "declaration"
          : page.confirmation
            ? "submission-confirmation"
            : undefined;

    const pageError = checkId(
      page.stepId,
      pages,
      page.stepId === fixedId ? new Set() : RESERVED_PAGE_IDS,
      "page",
    );

    if (pageError) issues.push({ code: "page-id", message: pageError, where: page.id });
    pages.add(page.stepId);

    if (page.pageType === "result")
      issues.push({
        code: "unsupported-result-page",
        message: "SSB cannot represent a calculator result page",
        where: page.id,
      });
    else {
      if (order[page.pageType] < lastOrder) orderError ??= page.id;
      lastOrder = Math.max(lastOrder, order[page.pageType]);
    }

    if (
      (page.pageType === "check-answers" || page.pageType === "declaration") &&
      types.has(page.pageType)
    )
      issues.push({
        code: "duplicate-page-type",
        message: `Only one ${page.pageType === "check-answers" ? "check answers" : "declaration"} page is allowed`,
        where: page.id,
      });
    types.add(page.pageType);

    if (page.pageType === "check-answers" && page.blocks.length)
      issues.push({
        code: "check-answers-content",
        message: "SSB builds this page: move these blocks to another page",
        where: page.id,
      });

    if (page.pageType === "declaration") {
      const question = page.blocks[0];

      if (
        page.blocks.length !== 1 ||
        question?.type !== "question" ||
        !question.titleId ||
        question.kind !== "checkboxes" ||
        question.options.length !== 1 ||
        question.settings.required !== true ||
        question.description.some((block) => block.type !== "text" || block.style !== "paragraph")
      )
        issues.push({
          code: "declaration-content",
          message: "Only one required declaration checkbox with one option belongs here",
          where: page.id,
        });
    }

    if (page.confirmation) {
      if (confirmation)
        issues.push({
          code: "confirmation-pages",
          message: "Only one confirmation page is allowed",
          where: page.id,
        });

      if (page.blocks.some((block) => block.type !== "text" && block.type !== "list"))
        issues.push({
          code: "confirmation-content",
          message:
            "Keep only text, headings and lists on the confirmation page. Move other blocks to an earlier page.",
          where: page.id,
        });
      confirmation = true;
    }

    for (const block of page.blocks) {
      if (block.type !== "question") continue;
      const fieldError = checkId(block.fieldId, fields);

      if (fieldError) issues.push({ code: "field-id", message: fieldError, where: block.id });
      fields.add(block.fieldId);

      if (
        block.settings.required &&
        (!block.errors.required?.trim() || isFieldless(block.errors.required))
      )
        issues.push({
          code: "required-message",
          message: "The required message must say which answer is missing",
          where: block.id,
        });
      const field = definition.fields.find((field) => field.kind === block.kind);

      if (field)
        issues.push(
          ...field.validate(block.settings, block.id),
          ...(field.legacySsb?.validateOutput?.(block) ?? []),
        );

      if (block.settings.isDisabled !== undefined && typeof block.settings.isDisabled !== "boolean")
        issues.push({
          code: "field-disabled",
          message: "Disabled must be true or false",
          where: block.id,
        });

      if (block.fieldId === "declaration-confirmed" && block.settings.isDisabled)
        issues.push({
          code: "declaration-disabled",
          message: "The declaration checkbox must stay enabled",
          where: block.id,
        });
      const values = new Set<string>();

      for (const option of block.options) {
        if (!option.value.trim() || values.has(option.value))
          issues.push({
            code: "option-value",
            message: !option.value.trim()
              ? "Enter an option value"
              : "Another option already uses this value",
            where: option.id,
          });
        values.add(option.value);
      }
    }
  }

  if (!confirmation)
    issues.push({
      code: "no-confirmation",
      message: "Add a confirmation page: SSB ends every form with one",
      where: "start",
    });

  if (!types.has("declaration"))
    issues.push({
      code: "no-declaration",
      message: "Add a declaration page before the confirmation page",
      where: "start",
    });

  if (orderError !== undefined)
    issues.push({
      code: "page-order",
      message:
        "End the form with check answers (optional), declaration, then the confirmation page",
      where: orderError,
    });
  issues.push(...(schema.dynamicTextIssues ?? []));
  issues.push(...logicAgeIssues(schema));
  issues.push(...unavailableLogicActions(schema, definition.logicActions));
  issues.push(
    ...repeatIssues(
      schema,
      (kind) =>
        definition.fields.find((field) => field.kind === kind)?.capabilities.repeat ?? false,
    ),
  );
  issues.push(...nestingIssues(schema));
  issues.push(...formSettingsIssues(schema));

  return issues;
}
