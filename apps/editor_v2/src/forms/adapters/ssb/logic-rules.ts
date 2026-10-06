import { wordingTargets } from "./wording";
import type { Comparison, Condition } from "../../core/logic";
import type {
  FormBlock,
  FormLogic,
  FormPage,
  FormQuestion,
  LegacySsbFormSchema as FormSchema,
} from "./schema";
import {
  compileWording,
  type NativeWordingCondition,
  type WordingOperator,
} from "../../core/dynamic-text";

type FieldConditionalOnBehaviour = NonNullable<FormBlock["shownWhen"]>[number];

type Single = Extract<Condition, { type: "SINGLE" }>;

export type RuleIssue = { code: string; where: string; message: string };

export type LogicProjection = {
  supportedActions: Set<string>;
  issues: RuleIssue[];
  warnings: RuleIssue[];
};

export const logicActionKey = (rule: string, action: string, position = 0) =>
  JSON.stringify([rule, action, position]);

// The projection consumes Hidden baselines; validation of that same projection still needs their provenance.
const hiddenBaselines = new WeakMap<FormBlock, boolean>();

const toNative: Partial<Record<Comparison, WordingOperator>> = {
  IS: "equal",
  EQUAL: "equal",
  IS_NOT: "notEqual",
  NOT_EQUAL: "notEqual",
  IS_ANY_OF: "in",
  IS_NOT_EMPTY: "exists",
  GREATER_OR_EQUAL_THAN: "gte",
  LESS_OR_EQUAL_THAN: "lte",
  GREATER_THAN: "gt",
  LESS_THAN: "lt",
};

/** Flatten conjunctions only. OR cannot be approximated by native fieldConditionalOn's AND list. */
function conjunction(rows: Condition[], operator: string): Single[] | undefined {
  if (!rows.length) return;

  if (rows.length > 1 && operator !== "AND") return;
  const result: Single[] = [];

  for (const row of rows) {
    if (row.type === "SINGLE") result.push(row);
    else {
      const children = conjunction(row.conditionals, row.logicalOperator);

      if (!children) return;
      result.push(...children);
    }
  }

  return result;
}

function nativeWording(row: Single, question: FormQuestion) {
  const multiple = ["checkboxes", "checkbox-accordion"].includes(question.kind);

  const operator =
    row.comparison === "CONTAINS" && multiple ? "in" : row.comparison && toNative[row.comparison];

  if (!operator) return;
  let value: Single["value"] | { options: string[] | number[] } | { option: string } = row.value;

  if (question.options.length && !row.valueIsLiteral && operator !== "exists") {
    if (Array.isArray(row.value)) value = { options: row.value };
    else if (typeof row.value === "string")
      value = operator === "in" ? { options: [row.value] } : { option: row.value };
  }

  return {
    id: row.id,
    field: row.field,
    operator,
    value,
    transform: row.transform,
    text: "temporary",
  };
}

/** Project only faithful native subsets; everything else remains an editable, warned action. */
export function projectLogicRules(schema: FormSchema, apply = true): LogicProjection {
  const result: LogicProjection = { supportedActions: new Set(), issues: [], warnings: [] };
  const fields = new Map<string, { question: FormQuestion; page: FormPage }>();
  const targets = new Map<string, { block: FormBlock; page: FormPage }>();
  const rules: { rule: FormLogic; page: FormPage }[] = [];

  for (const page of schema.pages)
    for (const block of page.blocks) {
      targets.set(block.id, { block, page });

      if (block.type === "question") fields.set(block.id, { question: block, page });

      if (block.type === "logic") rules.push({ rule: block, page });
    }

  const owners = new Map<string, Set<string>>();

  for (const { rule } of rules)
    for (const action of rule.actions) {
      const ids =
        action.type === "SHOW_BLOCKS"
          ? action.showBlocks
          : action.type === "HIDE_BLOCKS"
            ? action.hideBlocks
            : undefined;

      for (const id of ids ?? []) {
        const set = owners.get(id) ?? new Set<string>();
        set.add(`${rule.id}:${action.type}`);
        owners.set(id, set);
      }
    }

  const wordingTargetsList = wordingTargets(schema.pages);

  const wording = new Map<
    string,
    {
      target: FormQuestion | FormPage;
      type: "CHANGE_LABEL" | "CHANGE_PAGE_TITLE";
      blocked: boolean;
      variants: { key: string; rule: string; condition: NativeWordingCondition; text: string }[];
    }
  >();

  for (const { rule, page } of rules)
    for (const [position, action] of rule.actions.entries()) {
      const key = logicActionKey(rule.id, action.id, position);

      const warn = (message: string) =>
        result.warnings.push({
          code: `ssb-action-${action.type?.toLowerCase()}`,
          where: rule.id,
          message,
        });

      const fail = (code: string, message: string) =>
        result.issues.push({ code, where: rule.id, message });

      const rows = conjunction(rule.conditionals, rule.logicalOperator);

      if (action.type === "CHANGE_LABEL" || action.type === "CHANGE_PAGE_TITLE") {
        const payload =
          action.type === "CHANGE_LABEL" ? action.changeLabel : action.changePageTitle;

        const target =
          action.type === "CHANGE_LABEL"
            ? fields.get(payload?.target ?? "")?.question
            : schema.pages.find((p) => p.id === payload?.target);

        if (!payload?.target || !target) {
          fail(
            "wording-target",
            "Choose a question or page that still exists for this wording action.",
          );
          continue;
        }

        const targetKey = JSON.stringify([action.type, payload.target]);

        const group = wording.get(targetKey) ?? {
          target,
          type: action.type,
          blocked: false,
          variants: [],
        };

        wording.set(targetKey, group);

        if (typeof payload.text !== "string" || !payload.text.trim()) {
          group.blocked = true;
          fail("wording-empty", "Enter replacement text for this wording action.");
          continue;
        }

        if (!rows || rows.length !== 1) {
          group.blocked = true;
          warn(
            "SSB wording supports one comparison per rule. Keep this rule saved, or use a single condition.",
          );
          continue;
        }

        const row = rows[0]!;
        const field = fields.get(row.field ?? "");

        if (!field) {
          group.blocked = true;
          continue;
        } // The reference validator reports this at the rule.

        const native = nativeWording(row, field.question);

        if (!native) {
          group.blocked = true;
          warn("SSB cannot use this comparison for conditional wording. The rule stays saved.");
          continue;
        }

        const compiled = compileWording(
          [{ ...native, text: payload.text }],
          wordingTargetsList,
          rule.id,
        );

        if (compiled.issues.length) {
          group.blocked = true;
          result.issues.push(...compiled.issues);
          continue;
        }

        const { text, ...condition } = compiled.variants[0]!;
        group.variants.push({ key, rule: rule.id, text, condition });
      } else if (action.type === "SHOW_BLOCKS") {
        if (!action.showBlocks?.length || !rows?.length) {
          if (rule.conditionals.length && !rows)
            warn("SSB cannot map an any-match Show rule. The rule stays saved.");
          continue;
        }

        const selected = action.showBlocks.map((id) => targets.get(id));

        if (
          selected.some(
            (target) =>
              !target ||
              target.page.id !== page.id ||
              ["logic", "calculated-fields"].includes(target.block.type),
          )
        ) {
          warn(
            "SSB can show whole questions or content on the rule’s page. This target needs a runtime mapping.",
          );
          continue;
        }

        if (action.showBlocks.some((id) => (owners.get(id)?.size ?? 0) > 1)) {
          warn(
            "Several visibility rules affect this target. SSB cannot combine them faithfully yet.",
          );
          continue;
        }

        const initiallyHidden = (block: FormBlock) => {
          if (block.type === "question") {
            const answer =
              block.options.length && block.kind !== "checkbox-accordion"
                ? block.options.every((option) => option.hidden)
                : block.hidden;

            return (
              answer &&
              (!block.titleId || block.titleHidden) &&
              block.description.every((line) => line.hidden)
            );
          }

          return block.type === "list"
            ? block.items.every((item) => item.hidden)
            : "hidden" in block
              ? block.hidden
              : undefined;
        };

        if (
          selected.some(
            (target) => !(hiddenBaselines.get(target!.block) ?? initiallyHidden(target!.block)),
          )
        ) {
          warn(
            "Choose ‘Hide targets initially’ in this logic block so the Show rule reveals them only when its conditions match.",
          );
          continue;
        }

        const behaviours: FieldConditionalOnBehaviour[] = [];

        for (const row of rows) {
          if (row.transform) break;
          const field = fields.get(row.field ?? "");

          if (!field || field.page.id !== page.id) break;
          const native = nativeWording(row, field.question);

          if (!native || !["equal", "in"].includes(native.operator!)) break;
          const compiled = compileWording([native], wordingTargetsList, rule.id);

          if (compiled.issues.length) {
            result.issues.push(...compiled.issues);
            break;
          }

          const condition = compiled.variants[0]!;

          if (
            typeof condition.value !== "string" &&
            typeof condition.value !== "boolean" &&
            !(Array.isArray(condition.value) && condition.value.every((v) => typeof v === "string"))
          )
            break;

          if (condition.operator !== "equal" && condition.operator !== "in") break;
          behaviours.push({
            type: "fieldConditionalOn",
            targetFieldId: condition.targetFieldId,
            operator: condition.operator,
            value: condition.value,
          });
        }

        if (behaviours.length !== rows.length) {
          warn(
            "SSB can map Show rules using same-page answer equality or choice membership. This rule stays saved.",
          );
          continue;
        }

        if (apply)
          for (const selectedTarget of selected) {
            if (!selectedTarget) continue;
            const { block } = selectedTarget;
            hiddenBaselines.set(block, true);
            block.shownWhen = [...behaviours, ...(block.shownWhen ?? [])].filter(
              (entry, index, all) =>
                all.findIndex((other) => JSON.stringify(entry) === JSON.stringify(other)) === index,
            );

            if ("hidden" in block) delete block.hidden; // The native behaviour supplies the hidden-until-matched baseline.

            if (block.type === "question") {
              delete block.titleHidden;
              block.description.forEach((line) => {
                delete line.hidden;
              });

              // Grouped choices live inside one widget; their option data is not the widget's Hidden baseline.
              if (block.kind !== "checkbox-accordion")
                block.options.forEach((option) => {
                  delete option.hidden;
                });
            }

            if (block.type === "list")
              block.items.forEach((item) => {
                delete item.hidden;
              });
          }

        result.supportedActions.add(key);
      }
    }

  for (const group of wording.values()) {
    if (group.blocked) {
      for (const variant of group.variants)
        result.warnings.push({
          code: `ssb-action-${group.type.toLowerCase()}`,
          where: variant.rule,
          message:
            "Another wording rule for this target cannot be mapped to SSB. Resolve it before using this wording, so the first-match order stays correct.",
        });
      continue;
    }

    for (const { key, condition, text } of group.variants) {
      result.supportedActions.add(key);

      if (apply) {
        if ("type" in group.target && group.target.type === "question")
          (group.target.conditionalLabel ??= []).push({
            ...condition,
            label: text,
          });
        else if ("pageType" in group.target)
          (group.target.conditionalTitle ??= []).push({ ...condition, title: text });
      }
    }
  }

  return result;
}
