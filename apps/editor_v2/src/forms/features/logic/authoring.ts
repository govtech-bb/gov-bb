import { $native, $setNative } from "../../editor/native-state";
import { $bindNativeAuthoring } from "../../editor/native-authoring";
import { $setNativeWidget } from "./native-authoring";
import { settingsState } from "../../../editor/core/document-state";
import type { Condition as NativeCondition } from "../../schema/types";
import { $hasConditionalLogic } from "../../editor/field-context";
import {
  $setState,
  $addUpdateTag,
  $getNodeByKey,
  $getRoot,
  createCommand,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { conditionalLogic, type Action, type Condition } from "../../core/logic";
import { $hostOf, $nestPaths } from "../../editor/nesting";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $canHide,
  $createWidgetNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $formBlocks,
  $headEnd,
  $isInput,
  $isOptionNode,
  $isPageBreak,
  $isPageHead,
  $pageBlocks,
  $questionKey,
  $setDepth,
  $setSettings,
  $settings,
  $withNested,
  type OptionNode,
} from "../../editor/nodes";

export const OPEN_FOLLOW_UP_COMMAND = createCommand<NodeKey>("OPEN_FOLLOW_UP");

export const $logicNodes = () =>
  $formBlocks().filter((node) => $blockKind(node) === "conditional-logic");

export const $logicActions = (node: LexicalNode): Action[] =>
  Array.isArray($settings(node).actions) ? conditionalLogic($settings(node)).actions : [];

/** Resolve the picker's whole-question, page and individual-block targets without changing their scope. */
export function $showTargetBlocks(actions: Action[]): LexicalNode[] {
  const ids = new Set(
    actions.flatMap((action) => (action.type === "SHOW_BLOCKS" ? (action.showBlocks ?? []) : [])),
  );

  const selected = new Map<NodeKey, LexicalNode>();

  const add = (nodes: LexicalNode[]) =>
    nodes
      .filter((node) => $canHide(node) && !$isPageHead(node))
      .forEach((node) => selected.set(node.getKey(), node));

  for (const node of $formBlocks()) {
    const id = $blockId(node);

    if ($isPageBreak(node) && ids.has(id)) add($pageBlocks(node));
    else if ($isInput(node) && ids.has($questionKey(node))) add($blockGroup(node));
    else if (ids.has(id) || ($isInput(node) && id === $questionKey(node) && ids.has(`${id}:${id}`)))
      add([node]);
  }

  return [...selected.values()];
}

export const $showCoveredKeys = () =>
  new Set($showTargetBlocks($logicNodes().flatMap($logicActions)).map((block) => block.getKey()));

/** Hidden question members without a Show owner remain recoverable after deletion, source edits and reload. */
export function $hiddenWithoutShow(node: LexicalNode, covered = $showCoveredKeys()) {
  const group = $blockGroup(node);

  return group.some($isInput)
    ? group.filter((block) => $settings(block).hidden === true && !covered.has(block.getKey()))
    : [];
}

/** Recheck current coverage so a stale recovery control cannot unhide a newly claimed target. */
export function $makeVisibleWithoutShow(node: LexicalNode) {
  const hidden = $hiddenWithoutShow(node);

  if (hidden.length) $addUpdateTag(HISTORY_PUSH_TAG);

  for (const block of hidden) $setSettings(block, { hidden: undefined });
}

/** Selecting new Show targets establishes their baseline in the same undo step as the rule edit. */
export function $setLogicActions(node: LexicalNode, actions: Action[]) {
  const previous = new Set($showTargetBlocks($logicActions(node)).map((block) => block.getKey()));
  const added = $showTargetBlocks(actions).filter((block) => !previous.has(block.getKey()));

  if (added.length) $addUpdateTag(HISTORY_PUSH_TAG);

  for (const block of added) $setSettings(block, { hidden: true });
  $setSettings(node, { actions: actions });
}

/** An explicit repair for imported rules or targets made visible after the rule was written. */
export function $hideShowTargets(node: LexicalNode) {
  $addUpdateTag(HISTORY_PUSH_TAG);

  for (const block of $showTargetBlocks($logicActions(node))) $setSettings(block, { hidden: true });
}

/** Rules sit after the whole outer question, never between its options. */
export function $logicPosition(node: LexicalNode): LexicalNode {
  if ($isPageHead(node)) {
    const blocks = $formBlocks();

    const page = blocks
      .slice(0, blocks.indexOf(node) + 1)
      .findLast((block, index) => index === 0 || $isPageBreak(block));

    return page ? $headEnd(page) : node;
  }

  let outer = node;

  for (let host = $hostOf(outer); host; host = $hostOf(outer)) outer = host;

  return $withNested($blockGroup(outer)).at(-1) ?? outer;
}

export function $createLogic(
  node: LexicalNode,
  action: Action,
  condition?: Condition | Condition[],
) {
  if (!$hasConditionalLogic()) throw new Error("Conditional logic is not installed");
  $addUpdateTag(HISTORY_PUSH_TAG);

  const logic = $setDepth(
    $setSettings($createWidgetNode("conditional-logic"), {
      logicalOperator: "AND",
      conditionals: Array.isArray(condition)
        ? condition
        : [condition ?? { id: crypto.randomUUID(), type: "SINGLE" }],
      actions: [action],
    }),
    0,
  );

  $logicPosition(node).insertAfter(logic);
  $ensureBlockIds($getRoot());

  return logic;
}

/** Native follow-ups keep their baseline visibility and every condition in visible logic blocks. */
function $finishNativeFollowUp(option: OptionNode, createdNodes: LexicalNode[]): NodeKey {
  $bindNativeAuthoring();
  const targetIds = new Set<string>();
  const nodes = createdNodes.filter((node) => node.isAttached());

  for (const node of nodes) {
    const native = $native(node);

    if (native.question) {
      targetIds.add(native.question.id);
      $setNative(node, { question: { ...native.question, visible: false } });
    } else if (native.content && !native.hintOwner && !native.container) {
      targetIds.add(native.content.id);
      $setNative(node, { content: { ...native.content, visible: false } });
    }

    if (
      native.question ||
      native.content ||
      native.part === "label" ||
      native.part === "hint" ||
      native.hintOwner
    )
      $setState(node, settingsState, { ...$settings(node), hidden: true });
  }

  const hosts = [...($nestPaths().get(option.getKey()) ?? []).filter($isOptionNode), option];

  const conditions: NativeCondition[] = hosts.map((host) => {
    const native = $native(host);

    if (!native.question || !native.option)
      throw new Error("A native follow-up needs an option with an identity");

    return { op: "selected", question: native.question.id, option: native.option.id };
  });

  const signature = (condition: NativeCondition) => JSON.stringify(condition);

  const conjunction = (current?: NativeCondition): NativeCondition => {
    const rows =
      current === undefined || current === true
        ? []
        : typeof current === "object" && current.op === "all"
          ? current.conditions
          : [current];

    const unique = new Map([...conditions, ...rows].map((row) => [signature(row), row]));

    return unique.size === 1
      ? [...unique.values()][0]!
      : { op: "all", conditions: [...unique.values()] };
  };

  const when = conjunction();
  let owned: NodeKey | undefined;

  for (const node of $logicNodes()) {
    const logic = $native(node).logic;

    if (!logic) continue;
    let changed = false;

    const rules = logic.rules.map((rule) => {
      if (rule.enabled === false) return rule;

      const targets = rule.actions.flatMap((action) =>
        action.type === "setVisible" && action.value
          ? action.targets.filter((target): target is string => typeof target === "string")
          : [],
      );

      if (!targets.some((target) => targetIds.has(target))) return rule;
      changed = true;
      targets.forEach((target) => targetIds.delete(target));

      return { ...rule, when: conjunction(rule.when) };
    });

    if (changed) {
      $setNativeWidget(node.getKey(), { ...logic, rules });
      owned ??= node.getKey();
    }
  }

  if (!targetIds.size && owned) return owned;

  for (const node of $logicNodes()) {
    const logic = $native(node).logic;

    if (!logic) continue;

    const index = logic.rules.findIndex(
      (rule) =>
        rule.enabled !== false &&
        signature(rule.when) === signature(when) &&
        rule.actions.some((action) => action.type === "setVisible" && action.value),
    );

    if (index < 0) continue;

    const rules = structuredClone(logic.rules),
      rule = rules[index]!;

    const action = rule.actions.find((action) => action.type === "setVisible" && action.value)!;

    if (action.type === "setVisible") action.targets.push(...targetIds);
    $setNativeWidget(node.getKey(), { ...logic, rules });

    return node.getKey();
  }

  const node = $setDepth($createWidgetNode("conditional-logic"), 0);
  $logicPosition(option).insertAfter(node);
  $ensureBlockIds($getRoot());
  $setNativeWidget(node.getKey(), {
    id: $blockId(node),
    type: "logic",
    rules: [
      {
        id: crypto.randomUUID(),
        when,
        actions: [{ type: "setVisible", targets: [...targetIds], value: true }],
      },
    ],
  });

  return node.getKey();
}

/** Called in the same insertion transaction, after the new follow-up blocks have been attached. */
export function $finishFollowUp(option: OptionNode, createdNodes: LexicalNode[]): NodeKey {
  if (!$hasConditionalLogic()) throw new Error("Conditional logic is not installed");
  $addUpdateTag(HISTORY_PUSH_TAG);
  $ensureBlockIds($getRoot());
  $ensureQuestionFields($getRoot());

  if ($native($getRoot().getFirstChild()!).form) return $finishNativeFollowUp(option, createdNodes);

  const nodes = createdNodes.filter(
    (node) =>
      node.isAttached() &&
      !["conditional-logic", "calculated-fields", "page-break"].includes($blockKind(node)),
  );

  const targetIds = new Set<string>();
  const covered = new Set<NodeKey>();

  for (const node of nodes) {
    $setSettings(node, { hidden: true });

    if (covered.has(node.getKey())) continue;
    const group = $blockGroup(node);
    const input = group.find($isInput);

    if (input && nodes.includes(input)) {
      targetIds.add($questionKey(input));
      group.forEach((member) => covered.add(member.getKey()));
    } else targetIds.add($blockId(node));
  }

  const hosts = [...($nestPaths().get(option.getKey()) ?? []).filter($isOptionNode), option];

  const conditions: Condition[] = hosts.map((host) => ({
    id: crypto.randomUUID(),
    type: "SINGLE",
    field: $questionKey(host),
    comparison: $blockKind(host) === "checkboxes" ? "CONTAINS" : "IS",
    value: $blockId(host),
  }));

  const signature = (rows: Condition[]) =>
    rows
      .map((condition) => {
        const row = { ...condition };
        Reflect.deleteProperty(row, "id");

        return JSON.stringify(row);
      })
      .sort()
      .join("|");

  let owned: NodeKey | undefined;

  // A team definition may already have created an inner follow-up rule. Keep one owner for that target.
  for (const rule of $logicNodes()) {
    const targets = $logicActions(rule).flatMap((action) =>
      action.type === "SHOW_BLOCKS" ? (action.showBlocks ?? []) : [],
    );

    if (!targets.some((target) => targetIds.has(target))) continue;

    const current =
      $settings(rule).conditionals === undefined
        ? []
        : conditionalLogic($settings(rule)).conditionals;

    const signatures = new Set(current.map((condition) => signature([condition])));
    const additions = conditions.filter((condition) => !signatures.has(signature([condition])));

    const kept: Condition[] =
      $settings(rule).logicalOperator === "OR" && current.length > 1
        ? [{ id: crypto.randomUUID(), type: "GROUP", logicalOperator: "OR", conditionals: current }]
        : current;

    if (additions.length)
      $setSettings(rule, {
        logicalOperator: "AND",
        conditionals: [...additions, ...kept],
      });
    targets.forEach((target) => targetIds.delete(target));
    owned ??= rule.getKey();
  }

  if (!targetIds.size && owned) return owned;

  const existing = $logicNodes().find((node) => {
    const current =
      $settings(node).conditionals === undefined
        ? undefined
        : conditionalLogic($settings(node)).conditionals;

    return (
      current &&
      $settings(node).logicalOperator !== "OR" &&
      signature(current) === signature(conditions) &&
      $logicActions(node).some((action) => action.type === "SHOW_BLOCKS")
    );
  });

  if (existing) {
    const actions = $logicActions(existing);
    const index = actions.findIndex((action) => action.type === "SHOW_BLOCKS");
    $setSettings(existing, {
      actions: actions.map((action, i) =>
        i === index
          ? { ...action, showBlocks: [...new Set([...(action.showBlocks ?? []), ...targetIds])] }
          : action,
      ),
    });

    return existing.getKey();
  }

  return $createLogic(
    option,
    { id: crypto.randomUUID(), type: "SHOW_BLOCKS", showBlocks: [...targetIds] },
    conditions,
  ).getKey();
}

export function focusLogic(editor: LexicalEditor, key: NodeKey) {
  if (editor.isEditable())
    editor.update(() => {
      if (!editor.isEditable()) return;
      const target = $getNodeByKey(key);

      if (!target) return;

      for (const node of $formBlocks())
        if ($settings(node).folded) {
          const children = $isPageBreak(node) ? $pageBlocks(node) : $withNested($blockGroup(node));

          if (children.some((child) => child.is(target))) $setSettings(node, { folded: undefined });
        }
    });
  requestAnimationFrame(() => {
    const root = editor.getElementByKey(key);
    root?.scrollIntoView({ block: "center", behavior: "instant" });
    (
      root?.querySelector<HTMLElement>(
        "[data-logic-block] [role=combobox], [data-logic-block] button, [data-logic-block]",
      ) ?? root
    )?.focus({ preventScroll: true });
  });
}

export function $logicLinks(targets: string[]) {
  const ids = new Set(targets);

  return $logicNodes().flatMap((node, index) => {
    const effects = new Set<string>();

    for (const action of $logicActions(node)) {
      if (action.type === "SHOW_BLOCKS" && action.showBlocks?.some((id) => ids.has(id)))
        effects.add("Shown");

      if (action.type === "HIDE_BLOCKS" && action.hideBlocks?.some((id) => ids.has(id)))
        effects.add("Hidden");

      if (action.type === "REQUIRE_ANSWER" && action.requireAnswer && ids.has(action.requireAnswer))
        effects.add("Required");

      if (
        (action.type === "CHANGE_LABEL" &&
          action.changeLabel?.target &&
          ids.has(action.changeLabel.target)) ||
        (action.type === "CHANGE_PAGE_TITLE" &&
          action.changePageTitle?.target &&
          ids.has(action.changePageTitle.target))
      )
        effects.add("Wording");
    }

    return effects.size ? [{ key: node.getKey(), number: index + 1, effects: [...effects] }] : [];
  });
}
