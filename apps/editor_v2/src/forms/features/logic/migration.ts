import { $getRoot, type LexicalNode } from "lexical";
import type { Action, Comparison, Condition, LogicValue } from "../../core/logic";
import {
  durationTransforms,
  wordingOperators,
  type WordingOperator,
} from "../../core/dynamic-text";
import { $nestPaths } from "../../editor/nesting";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $createWidgetNode,
  $ensureBlockIds,
  $formBlocks,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isPageTitleNode,
  $listRun,
  $questionKey,
  $setDepth,
  $setSettings,
  $settings,
  $updateSettings,
  $withNested,
  type Setting,
} from "../../editor/nodes";

type Single = Extract<Condition, { type: "SINGLE" }>;

const fromNative: Record<WordingOperator, Comparison> = {
  equal: "IS",
  notEqual: "IS_NOT",
  in: "IS_ANY_OF",
  exists: "IS_NOT_EMPTY",
  gte: "GREATER_OR_EQUAL_THAN",
  lte: "LESS_OR_EQUAL_THAN",
  gt: "GREATER_THAN",
  lt: "LESS_THAN",
};

function migrateWording(
  raw: Setting,
  target: string,
  page: boolean,
): { conditions: Condition[]; actions: Action[] }[] {
  if (!Array.isArray(raw))
    throw new Error(
      "Cannot migrate conditional wording: its saved value is not a list. The original draft is retained.",
    );

  return raw.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(
        `Cannot migrate wording ${index + 1}: its saved condition is malformed. The original draft is retained.`,
      );
    const { id, field, text } = value;

    if (
      Object.keys(value).some(
        (key) => !["id", "field", "operator", "value", "text", "transform"].includes(key),
      )
    )
      throw new Error(
        `Cannot migrate wording ${index + 1}: unknown saved properties must be preserved. The original draft is retained.`,
      );

    if (
      (id !== undefined && typeof id !== "string") ||
      (field !== undefined && typeof field !== "string") ||
      (text !== undefined && typeof text !== "string")
    )
      throw new Error(
        `Cannot migrate wording ${index + 1}: malformed text or reference. The original draft is retained.`,
      );

    const operator = wordingOperators.find((operator) => operator === value.operator);

    if (value.operator !== undefined && operator === undefined)
      throw new Error(
        `Cannot migrate wording ${index + 1}: unsupported operator. The original draft is retained.`,
      );

    const transform = durationTransforms.find((transform) => transform === value.transform);

    if (value.transform !== undefined && transform === undefined)
      throw new Error(
        `Cannot migrate wording ${index + 1}: unsupported transform. The original draft is retained.`,
      );
    const original = value.value;
    let converted: LogicValue | undefined;
    let literal = true;

    if (original && typeof original === "object" && !Array.isArray(original)) {
      if (
        Object.keys(original).length === 1 &&
        "option" in original &&
        typeof original.option === "string"
      ) {
        converted = original.option;
        literal = false;
      } else if (
        Object.keys(original).length === 1 &&
        "options" in original &&
        Array.isArray(original.options) &&
        original.options.every((v) => typeof v === "string")
      ) {
        converted = original.options;
        literal = false;
      } else
        throw new Error(
          `Cannot migrate wording ${index + 1}: unsupported comparison value. The original draft is retained.`,
        );
    } else if (
      original === undefined ||
      typeof original === "string" ||
      typeof original === "number" ||
      typeof original === "boolean" ||
      (Array.isArray(original) &&
        (original.every((item) => typeof item === "string") ||
          original.every((item) => typeof item === "number")))
    )
      converted = original;
    else
      throw new Error(
        `Cannot migrate wording ${index + 1}: unsupported comparison value. The original draft is retained.`,
      );

    const condition: Single = {
      id: id ?? crypto.randomUUID(),
      type: "SINGLE",
      ...(field !== undefined && { field }),
      ...(operator !== undefined && { comparison: fromNative[operator] }),
      ...(converted !== undefined && { value: converted }),
      ...(literal && { valueIsLiteral: true }),
      ...(transform && { transform }),
    };

    const payload = { target, ...(text !== undefined && { text }) };

    const action: Action = {
      id: crypto.randomUUID(),
      ...(page
        ? { type: "CHANGE_PAGE_TITLE", changePageTitle: payload }
        : { type: "CHANGE_LABEL", changeLabel: payload }),
    };

    return { conditions: [condition], actions: [action] };
  });
}

/** One-time v1/legacy upgrade. The caller supplies normalized nodes with stable identities. */
export function $migrateLegacyConditions(): void {
  const blocks = $formBlocks();
  const title = blocks[0];

  if (!title || $settings(title).logicVersion === 2) return;
  const paths = $nestPaths();
  const pending: { anchor: LexicalNode; conditions: Condition[]; actions: Action[] }[] = [];
  const removals: { node: LexicalNode; property: string }[] = [];
  const hidden = new Set<LexicalNode>();

  const anchorFor = (source?: LexicalNode) => {
    if (!source)
      return (
        blocks
          .slice(1)
          .findLast(
            (node) =>
              !$isPageBreak(node) && !blocks.slice(1, blocks.indexOf(node) + 1).some($isPageBreak),
          ) ?? title
      );
    const outer = paths.get(source.getKey())?.[0] ?? source;

    return $withNested($blockGroup(outer)).at(-1) ?? outer;
  };

  const inputs = blocks.filter($isInput);
  const seen = new Set<string>();

  for (const node of blocks) {
    const isTitle = $isPageTitleNode(node);

    if (!isTitle && !$isInput(node)) continue;
    const property = isTitle ? "conditionalTitle" : "conditionalLabel";
    const raw = $settings(node)[property];

    if (raw === undefined) continue;

    const start = isTitle
      ? blocks.slice(0, blocks.indexOf(node)).findLast((block, i) => i === 0 || $isPageBreak(block))
      : undefined;

    const target = isTitle ? (start === title ? "start" : $blockId(start!)) : $questionKey(node);

    if (!seen.has(`${property}:${target}`)) {
      const rules = migrateWording(raw, target, isTitle);
      // Every variant for a target stays together. Placing each after its own source would reorder first-match priority.
      const first = rules[0]?.conditions[0];
      const field = first?.type === "SINGLE" ? first.field : undefined;
      const anchor = anchorFor(inputs.find((input) => $questionKey(input) === field));
      pending.push(...rules.map((rule) => ({ ...rule, anchor })));
    }

    seen.add(`${property}:${target}`);
    removals.push({ node, property });
  }

  for (const option of blocks.filter($isOptionNode)) {
    const targets = new Set<string>();

    for (const node of blocks) {
      if (!paths.get(node.getKey())?.at(-1)?.is(option)) continue;
      const group = $blockGroup(node);
      const input = group.find($isInput);

      if (input) {
        targets.add($questionKey(input));
        group.forEach((member) => hidden.add(member));
      } else if ($isListLine(node)) {
        const run = $listRun(node);
        targets.add($blockId(run[0]!));
        run.forEach((line) => hidden.add(line));
      } else {
        targets.add($blockId(node));
        hidden.add(node);
      }
    }

    if (!targets.size) continue;
    const hosts = [...(paths.get(option.getKey()) ?? []).filter($isOptionNode), option];

    const conditions: Condition[] = hosts.map((host) => ({
      id: crypto.randomUUID(),
      type: "SINGLE",
      field: $questionKey(host),
      comparison: $blockKind(host) === "checkboxes" ? "CONTAINS" : "IS",
      value: $blockId(host),
    }));

    pending.push({
      anchor: anchorFor(option),
      conditions,
      actions: [{ id: crypto.randomUUID(), type: "SHOW_BLOCKS", showBlocks: [...targets] }],
    });
  }

  // Validate all legacy values before changing any node, so failed migration never partly consumes a draft.
  for (const { node, property } of removals) $updateSettings(node, { [property]: undefined });

  for (const node of hidden) $setSettings(node, { hidden: true });
  const anchors = new Map<string, LexicalNode>();

  for (const { anchor, conditions, actions } of pending) {
    const after = anchors.get(anchor.getKey()) ?? anchor;

    const rule = $setSettings($setDepth($createWidgetNode("conditional-logic"), 0), {
      logicalOperator: "AND",
      conditionals: conditions,
      actions: actions,
    });

    after.insertAfter(rule);
    anchors.set(anchor.getKey(), rule);
  }

  $setSettings(title, { logicVersion: 2 });
  $ensureBlockIds($getRoot());
}
