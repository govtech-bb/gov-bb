import { $isHeadingNode } from "@lexical/rich-text";
import {
  $addUpdateTag,
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isRootNode,
  $setSelection,
  HISTORY_PUSH_TAG,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { conditionalLogic, type Condition } from "../../core/logic";
import { $logicActions, $logicNodes } from "../../features/logic/authoring";
import { $remapCopies } from "../../features/mentions/editor";
import { $installedField } from "../field-context";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $canHide,
  $createQuestionNode,
  $deepCopy,
  $depth,
  $depthAt,
  $headEnd,
  $headStart,
  $isFoldedAway,
  $isFormTitleNode,
  $isInput,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $isShowHideNode,
  $nextBlock,
  $prevBlock,
  $questionKey,
  $rebase,
  $setDepth,
  $setHidden,
  $setSettings,
  $settings,
  $withNested,
} from "../nodes";
import { $step } from "./editing";

export function $selectNodes(nodes: LexicalNode[]) {
  const selection = $createNodeSelection();

  for (const node of nodes) selection.add(node.getKey());
  $setSelection(nodes.length ? selection : null);
}

/** Blocks once each, in reading order. */
export const $sorted = (blocks: LexicalNode[]) =>
  [...new Map(blocks.map((block) => [block.getKey(), block])).values()].sort((a, b) =>
    a.isBefore(b) ? -1 : 1,
  );

/** Selected root blocks in reading order. */
export function $selectedBlocks() {
  const selection = $getSelection();

  if (!$isNodeSelection(selection)) return [];

  return $sorted(selection.getNodes().filter((node) => $isRootNode(node.getParent())));
}

/** Blocks with what goes with them: a title's whole question, a folded page's blocks. */
export function $withGroups(blocks: LexicalNode[]) {
  return $sorted(
    $withNested(
      blocks.flatMap((block) =>
        $isQuestionNode(block) || $isPageBreak(block) ? $blockGroup(block) : [block],
      ),
    ),
  );
}

/** Remove selected groups while preserving the form title. */
export function $removeBlocks(blocks: LexicalNode[]) {
  $addUpdateTag(HISTORY_PUSH_TAG);

  for (const block of $withGroups(blocks)) if (!$isFormTitleNode(block)) block.remove();
}

/** Option values are local to a question; clear them only when copies join existing options. */
export function $restoreCopiedOptionValues(pairs: [LexicalNode, LexicalNode][]) {
  const copied = new Set(pairs.map(([, copy]) => copy.getKey()));

  for (const [original, copy] of pairs) {
    const value = $settings(original).optionValue;

    if (!$isOptionNode(copy) || value === undefined) continue;

    if (
      $blockGroup(copy)
        .filter($isOptionNode)
        .every((option) => copied.has(option.getKey()))
    )
      $setSettings(copy, { optionValue: value });
  }
}

/** Insert copies after the original group and remap their internal logic and mention references. */
export function $copyAfter(blocks: LexicalNode[], addQuestionTitle = false) {
  $addUpdateTag(HISTORY_PUSH_TAG);
  const keys = new Set(blocks.map((node) => node.getKey()));

  const ids = new Set(
    blocks.flatMap((node) =>
      $isInput(node)
        ? [$blockId(node), $questionKey(node), `${$questionKey(node)}:${$blockId(node)}`]
        : [$blockId(node)],
    ),
  );

  for (const node of blocks)
    if ($isInput(node))
      for (const id of $installedField($blockKind(node))?.ownedIds?.($settings(node)) ?? [])
        ids.add(id);

  const choices = new Set(
    blocks.flatMap((node) => {
      const field = $installedField($blockKind(node));

      return field?.source.choice || field?.source.referencesOptions ? [$questionKey(node)] : [];
    }),
  );

  const internal = (condition: Condition): boolean => {
    if (condition.type === "GROUP")
      return !!condition.conditionals.length && condition.conditionals.every(internal);

    if (!condition.field || !ids.has(condition.field)) return false;
    const value = condition.value;

    if (value && typeof value === "object" && !Array.isArray(value)) return ids.has(value.field);

    if (
      !condition.valueIsLiteral &&
      choices.has(condition.field) &&
      !["IS_EMPTY", "IS_NOT_EMPTY"].includes(condition.comparison ?? "")
    )
      return (Array.isArray(value) ? value : [value]).every(
        (value) => typeof value === "string" && ids.has(value),
      );

    return true;
  };

  // A copied question keeps its self-contained reveals. Other rules remain attached to the originals.
  const owned = $logicNodes().flatMap((rule) => {
    if (keys.has(rule.getKey())) return [];
    const { conditionals: conditions } = conditionalLogic($settings(rule));

    if (!conditions?.length || !conditions.every(internal)) return [];

    const actions = $logicActions(rule).filter(
      (action) =>
        action.type === "SHOW_BLOCKS" &&
        !!action.showBlocks?.length &&
        action.showBlocks.every((id) => ids.has(id)),
    );

    return actions.length ? [{ rule, actions }] : [];
  });

  const pairs = blocks.map((block): [LexicalNode, LexicalNode] => [block, $deepCopy(block)]);

  for (const { rule, actions } of owned)
    pairs.push([rule, $setSettings($deepCopy(rule), { actions })]);
  let after = blocks.at(-1)!;

  if (addQuestionTitle)
    after = after.insertAfter($setDepth($createQuestionNode(), $depth(blocks[0]!)));
  pairs.reduce<LexicalNode>((at, [, copy]) => at.insertAfter(copy), after);
  $restoreCopiedOptionValues(pairs);
  $remapCopies(pairs);
}

export const $duplicateBlocks = (blocks: LexicalNode[]) => $copyAfter($withGroups(blocks));

/** ⌘D and the block menu's Duplicate for one block: it, or its whole question ($blockGroup), copied after itself. */
export const $duplicateQuestion = (node: LexicalNode) => {
  const blocks = $withNested($blockGroup(node));
  // Untitled options would otherwise join the original question's run.
  $copyAfter(blocks, $isOptionNode(blocks[0]));
};

/**
 * Dragging a question label or folded page moves its group. An untitled question's first block also moves the group,
 * unless the drop target is inside that question, where individual blocks can be reordered.
 */
export function $dragged(node: LexicalNode, target?: LexicalNode | null): LexicalNode[] {
  if ($isQuestionNode(node) || $isPageBreak(node)) return $withNested($blockGroup(node));
  const group = $blockGroup(node);
  const untitledStart = $isInput(node) && !group.some($isQuestionNode) && group[0]!.is(node);

  return $withNested(untitledStart && !group.some((block) => target?.is(block)) ? group : [node]);
}

/** Dragging a selected block moves the selection; otherwise move that block’s group. */
export function $moving(node: LexicalNode, target?: LexicalNode | null) {
  const selected = $selectedBlocks();

  return $sorted(
    (selected.some((block) => block.is(node)) ? selected : [node]).flatMap((block) =>
      $dragged(block, target),
    ),
  );
}

/** Include hint text between the question label and its answer blocks. */
export function $questionOf(node: LexicalNode) {
  if ($isPageBreak(node)) return [node]; // a page's blocks aren't a question

  for (
    let at: LexicalNode | null = node;
    $isParagraphNode(at) || $isHeadingNode(at);
    at = $prevBlock(at)
  ) {
    const title = $prevBlock(at);

    if ($isQuestionNode(title))
      return $blockGroup(title).some((block) => block.is(node)) ? $blockGroup(title) : [node];
  }

  return $blockGroup(node);
}

/** A label without answer blocks does not yet constitute a question. */
export function $questionHolding(node: LexicalNode) {
  const question = $questionOf(node);

  return question.some($isInput) ? question : null;
}

/** A drop zone inserts blocks after its target. */
export type DropZone = { target: NodeKey };

/** A block's zone below it. */
export const $blockZone = (block: LexicalNode): DropZone => ({ target: block.getKey() });

export const $endsPage = (block: LexicalNode) => {
  const next = $nextBlock(block);

  return $isPageBreak(block) || !next || $isPageBreak(next);
};

export const isFolded = (node: LexicalNode) => $isPageBreak(node) && !!$settings(node).folded;

/**
 * Keep options inside their own question and other non-text blocks outside another question's answer group.
 * Folded-page targets accept only page breaks. A folded page highlights page boundaries, even when a drop inside
 * a page is allowed, because the whole page will move to that page's end.
 */
export function $dropCheck(node: LexicalNode, zone: DropZone) {
  const drop = $zoneCheck(node, zone);
  const target = $getNodeByKey(zone.target);

  return { drop, lit: drop && !(isFolded(node) && target && !$endsPage(target)) };
}

export function $zoneCheck(node: LexicalNode, zone: DropZone) {
  const target = $getNodeByKey(zone.target);

  if (!target) return false;

  if ($moving(node, target).some((block) => block.is(target))) return false;

  if (isFolded(target) && !$isPageBreak(node)) return false;

  if ($isOptionNode(node)) {
    const own = $blockGroup(node).filter($isOptionNode);
    const mine = (block: LexicalNode | null) => own.some((option) => option.is(block));

    return mine(target) || mine($nextBlock(target));
  }

  if ($isParagraphNode(node)) return true;

  if ($isQuestionNode(node) && $isFolded(target)) return true;
  const question = $questionHolding(target);

  if (!question) return true;

  // Within its own question a block goes anywhere; into another, only after its end
  return !!$questionHolding(node)?.[0]?.is(question[0]!) || target.is(question.at(-1)!);
}

/** Insert after the target’s folded group; whole folded pages move to the next page boundary. */
export function $dropBlocks(node: LexicalNode, zone: DropZone) {
  if (!$dropCheck(node, zone).drop) return;
  const target = $getNodeByKey(zone.target)!;
  const moving = $moving(node, target);

  const end = $isFolded(target)
    ? $withNested($blockGroup(target)).at(-1)!
    : $isOptionNode(node) && $isOptionNode(target)
      ? $withNested([target]).at(-1)!
      : isFolded(target)
        ? target
        : $headEnd(target);

  const depth = $depthAt(end, moving);
  const selected = $selectedBlocks();

  if ((selected.some((block) => block.is(node)) ? selected : [node]).every(isFolded)) {
    let at: LexicalNode | null = end.getNextSibling();

    while (at && !($isPageBreak(at) && !moving.some((block) => block.is(at))))
      at = at.getNextSibling();

    for (const block of moving) {
      if (at) at.insertBefore(block);
      else $getRoot().append(block);
    }

    return;
  }

  // One after another; one already in place stays
  moving.reduce((prev, block) => (block.is(prev) ? prev : prev.insertAfter(block)), end);

  if (!$isOptionNode(node)) $rebase(moving, depth);
}

/** Apply the first block’s visibility toggle to every selected group. */
export function $hideBlocks(blocks: LexicalNode[]) {
  const hidden = !$settings(blocks[0]!).hidden;

  for (const block of blocks)
    for (const node of $isQuestionNode(block)
      ? $blockGroup(block)
      : $isShowHideNode(block)
        ? $withNested([block])
        : [block])
      if ($canHide(node)) $setHidden(node, hidden);
}

/** Choice-question labels and expandable sections can fold their contents. */
export function $foldableTitle(node: LexicalNode) {
  if ($isShowHideNode(node)) return node;

  for (let prev: LexicalNode | null = node; prev && !$isPageBreak(prev); prev = $prevBlock(prev)) {
    if (!$isQuestionNode(prev)) continue;
    const group = $blockGroup(prev);

    if ($withNested(group).some((block) => block.is(node))) {
      if (group.some($isOptionNode)) return prev;
    } else if ($depth(prev) === 0) return null;
  }

  return null;
}

/** Whether a block is the title of a folded question. */
export const $isFolded = (node: LexicalNode) =>
  ($isShowHideNode(node) || ($isQuestionNode(node) && $foldableTitle(node) === node)) &&
  !!$settings(node).folded;

/** Keep block selection when folding so its keyboard shortcuts can unfold the group again; otherwise focus the label. */
export function $foldQuestion(node: LexicalNode, folded: boolean) {
  const title = $foldableTitle(node);

  if (!title || !!$settings(title).folded === folded) return;
  $setSettings(title, { folded });

  if (!node.is(title) && !$isNodeSelection($getSelection())) title.selectEnd();
}

/** The previous or next visible block, skipping folded content. */
export const $next = (node: LexicalNode | null | undefined, down: boolean) => {
  for (let next = node && $step(node, down); next; next = $step(next, down))
    if (!$isFoldedAway(next)) return next;

  return null;
};

/** Move the selected groups one visible block up or down. */
export function $moveBlocks(blocks: LexicalNode[], down: boolean) {
  const all = $withGroups(blocks);

  if (!all.length) return;
  const level = $depth(all[0]!);

  const step = (from: LexicalNode) => {
    let at = $next(from, down);

    while (at && $depth(at) > level) at = $next(at, down);

    return at;
  };

  const near = step(down ? all.at(-1)! : all[0]!);
  const next = near && !down ? $headStart(near) : near;

  if (!next || $depth(next) < level || (!down && $isFormTitleNode(next))) return;

  if (down)
    all.reduce(
      (at, block) => at.insertAfter(block),
      $withNested($isFolded(next) || isFolded(next) ? $blockGroup(next) : [$headEnd(next)]).at(-1)!,
    );
  else for (const block of all) next.insertBefore(block);
}
