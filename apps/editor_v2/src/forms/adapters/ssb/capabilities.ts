import type { Condition, LogicValue } from "../../core/logic";
import type { LegacySsbFormSchema as FormSchema } from "./schema";
import { formulaReferences, parseFormula } from "../../core/formula";
import { logicActionKey, projectLogicRules } from "./logic-rules";

/** Serialized authoring data supplements the legacy target without importing an editor runtime. */
export type SsbAuthoringSnapshot = { readonly root: unknown };

export type FormIssue = { code: string; message: string; where: string };

export type CapabilityWarning = FormIssue & { severity: "warning" };

const actionNames = {
  CALCULATE: "calculation",
  JUMP_TO_PAGE: "jump to page",
  REQUIRE_ANSWER: "require answer",
  SHOW_BLOCKS: "show blocks",
  HIDE_BLOCKS: "hide blocks",
  HIDE_BUTTON_TO_DISABLE_COMPLETION: "disable completion",
  CHANGE_LABEL: "change question label",
  CHANGE_PAGE_TITLE: "change page title",
};

const metadata = ["id", "respondentId", "formName"];

const ref = (value: LogicValue | undefined) =>
  value && typeof value === "object" && "field" in value && typeof value.field === "string"
    ? value.field
    : undefined;

type SnapshotNode = { type: string; field?: string; id: string; settings: Record<string, unknown> };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Decode only the authoring properties the SSB compatibility checks consume. */
function visitSnapshot(
  value: unknown,
  where: string,
  visit: (node: SnapshotNode, where: string) => void,
): void {
  if (!record(value)) return;
  const state = record(value.$) ? value.$ : {};
  const id = typeof state.id === "string" && state.id ? state.id : where;

  const node: SnapshotNode = {
    type: typeof value.type === "string" ? value.type : "",
    id,
    settings: record(state.settings) ? state.settings : {},
  };

  if (typeof value.field === "string") node.field = value.field;
  visit(node, where);

  if (Array.isArray(value.children))
    for (const child of value.children) visitSnapshot(child, id, visit);
}

function references(schema: FormSchema) {
  const fields = new Set(metadata);
  const targets = new Set(["start", "0"]);

  for (const page of schema.pages) {
    targets.add(page.id);

    for (const block of page.blocks) {
      targets.add(block.id);

      if (block.type === "question") {
        fields.add(block.id);
        targets.add(`${block.id}:${block.id}`);

        if (block.titleId) targets.add(block.titleId);

        for (const option of block.options) targets.add(option.id);

        for (const line of block.description) targets.add(line.id);
      }

      if (block.type === "list") for (const item of block.items) targets.add(item.id);

      if (block.type === "calculated-fields")
        for (const field of block.fields) fields.add(field.key);
    }
  }

  return { fields, targets };
}

/** Invalid references/formulas are errors, separately from valid drafts SSB cannot execute. */
export function logicIssues(schema: FormSchema, snapshot?: SsbAuthoringSnapshot): FormIssue[] {
  const issues: FormIssue[] = [];
  const { fields, targets } = references(schema);

  const questions = new Map(
    schema.pages.flatMap((page) =>
      page.blocks.flatMap((block) =>
        block.type === "question" ? [[block.id, block] as const] : [],
      ),
    ),
  );

  const checkRef = (key: string | undefined, where: string, known = fields) => {
    if (key && !known.has(key))
      issues.push({
        code: "missing-reference",
        where,
        message: "Choose a field or block that still exists in this form.",
      });
  };

  const condition = (row: Condition, where: string) => {
    if (row.type === "GROUP") {
      if (!row.conditionals.length)
        issues.push({
          code: "incomplete-condition",
          where,
          message: "Add a condition to this group, or remove the empty group.",
        });
      row.conditionals.forEach((child) => condition(child, where));
    } else {
      if (!row.field || !row.comparison)
        issues.push({
          code: "incomplete-condition",
          where,
          message: "Choose a field and comparison for this condition.",
        });

      if (
        row.field &&
        row.comparison &&
        row.value === undefined &&
        !["IS_EMPTY", "IS_NOT_EMPTY"].includes(row.comparison)
      )
        issues.push({
          code: "incomplete-condition",
          where,
          message: "Enter a value for this condition.",
        });
      checkRef(row.field, where);
      checkRef(ref(row.value), where);
      const question = questions.get(row.field ?? "");

      if (
        question &&
        ["multiple-choice", "checkboxes", "dropdown", "checkbox-accordion"].includes(
          question.kind,
        ) &&
        !row.valueIsLiteral &&
        row.comparison &&
        !["IS_EMPTY", "IS_NOT_EMPTY"].includes(row.comparison) &&
        !ref(row.value)
      ) {
        const selected = Array.isArray(row.value)
          ? row.value
          : typeof row.value === "string" && row.value
            ? [row.value]
            : [];

        if (!selected.length)
          issues.push({
            code: "incomplete-condition",
            where,
            message: "Choose an option for this condition.",
          });
        else if (selected.some((id) => !question.options.some((option) => option.id === id)))
          issues.push({
            code: "missing-option",
            where,
            message:
              "This condition refers to an option that was removed. Choose a current option.",
          });
      }
    }
  };

  for (const page of schema.pages)
    for (const block of page.blocks) {
      if (block.type === "calculated-fields")
        for (const field of block.fields) checkRef(ref(field.value), field.key);

      if (block.type !== "logic") continue;

      if (!block.conditionals.length)
        issues.push({
          code: "incomplete-condition",
          where: block.id,
          message: "Add a condition for this rule.",
        });
      block.conditionals.forEach((row) => condition(row, block.id));

      for (const action of block.actions) {
        if (!action.type) {
          issues.push({
            code: "incomplete-action",
            where: block.id,
            message: "Choose an action for this rule.",
          });
          continue;
        }

        const incomplete =
          action.type === "JUMP_TO_PAGE"
            ? !action.jumpToPage
            : action.type === "REQUIRE_ANSWER"
              ? !action.requireAnswer
              : action.type === "SHOW_BLOCKS"
                ? !action.showBlocks?.length
                : action.type === "HIDE_BLOCKS"
                  ? !action.hideBlocks?.length
                  : action.type === "CALCULATE"
                    ? !action.calculate?.field ||
                      !action.calculate.operator ||
                      (action.calculate.operator !== "FORMULA" &&
                        action.calculate.value === undefined)
                    : false;

        if (incomplete)
          issues.push({
            code: "incomplete-action",
            where: block.id,
            message: "Complete this action’s target and value.",
          });
        checkRef(action.jumpToPage, block.id, targets);
        checkRef(action.requireAnswer, block.id);
        [...(action.showBlocks ?? []), ...(action.hideBlocks ?? [])].forEach((key) =>
          checkRef(key, block.id, targets),
        );

        if (action.calculate) {
          checkRef(action.calculate.field, block.id);
          checkRef(ref(action.calculate.value), block.id);

          if (action.calculate.operator === "FORMULA") {
            const expression = action.calculate.expression ?? "";
            const result = parseFormula(expression);

            if ("error" in result)
              issues.push({
                code: "formula",
                where: block.id,
                message: `Fix the formula: ${result.error.toLowerCase()}.`,
              });

            for (const { field } of formulaReferences(expression)) checkRef(field, block.id);
          }
        }
      }
    }

  if (snapshot)
    visitSnapshot(snapshot.root, "start", (node, where) => {
      if (node.type === "mention") checkRef(node.field, where);
    });

  issues.push(...projectLogicRules(schema, false).issues);

  return issues.filter(
    (issue, index) =>
      issues.findIndex((other) => other.code === issue.code && other.where === issue.where) ===
      index,
  );
}

/** Native nesting/repeats/conditional wording already compile to SSB shapes; free-standing actions do not. */
export function capabilityWarnings(
  schema: FormSchema,
  snapshot?: SsbAuthoringSnapshot,
): CapabilityWarning[] {
  const warnings: CapabilityWarning[] = [];

  const add = (code: string, where: string, message: string) =>
    warnings.push({ code, where, message, severity: "warning" });

  const invalid = new Set(logicIssues(schema, snapshot).map((issue) => issue.where));
  const projection = projectLogicRules(schema, false);

  for (const page of schema.pages)
    for (const block of page.blocks) {
      if (block.type === "calculated-fields")
        for (const field of block.fields) {
          if (!invalid.has(field.key))
            add(
              "ssb-calculation",
              field.key,
              "SSB cannot run this calculated field yet. It stays saved in your form.",
            );
        }

      if (block.type === "logic" && !invalid.has(block.id)) {
        const types = new Set(
          block.actions
            .filter(
              (action, position) =>
                !projection.supportedActions.has(logicActionKey(block.id, action.id, position)),
            )
            .map((action) => action.type)
            .filter(Boolean),
        );

        for (const type of types)
          add(
            `ssb-action-${type!.toLowerCase()}`,
            block.id,
            projection.warnings.find(
              (issue) =>
                issue.where === block.id && issue.code === `ssb-action-${type!.toLowerCase()}`,
            )?.message ??
              `SSB cannot run this ${actionNames[type!] ?? type} action yet. It stays saved in your form.`,
          );
      }

      if (block.type === "widget")
        add(
          "ssb-widget",
          block.id,
          `SSB has no mapping for the “${block.kind}” block. It stays saved in your form.`,
        );

      if (block.type === "question")
        for (const option of block.options) {
          if (option.disabled)
            add("ssb-disabled-option", option.id, "SSB does not apply disabled options yet.");

          if (option.hidden)
            add(
              "ssb-hidden-option",
              option.id,
              "SSB does not apply hidden options yet. Remove the option if people must not choose it.",
            );
        }
    }

  if (snapshot)
    visitSnapshot(snapshot.root, "start", (node, where) => {
      if (node.type === "mention" && !invalid.has(where))
        add(
          "ssb-answer-mention",
          where,
          "SSB cannot insert this answer into body text yet. The reference stays saved in your form.",
        );
      const { settings, id } = node;

      if (node.type === "option" && settings.disabled === true)
        add("ssb-disabled-option", id, "SSB does not apply disabled options yet.");

      for (const key of [
        "randomize",
        "lockInPlace",
        "allowMultiple",
        "prefix",
        "suffix",
        "internationalFormat",
        "disableDays",
        "specificDates",
      ]) {
        if (settings[key] !== undefined && settings[key] !== false)
          add(
            "ssb-legacy-setting",
            id,
            `SSB does not apply the imported “${key}” setting. It stays saved in your form.`,
          );
      }
    });

  return warnings.filter(
    (warning, index) =>
      warnings.findIndex(
        (other) =>
          other.code === warning.code &&
          other.where === warning.where &&
          other.message === warning.message,
      ) === index,
  );
}
