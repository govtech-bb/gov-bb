import { $hasConditionalLogic } from "./field-context";
import {
  $createParagraphNode,
  $getState,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import type { Nested } from "../adapters/ssb/schema";
import type { FieldConditionalOnBehaviour } from "../adapters/ssb/nesting";
import {
  $blockGroup,
  $blockId,
  $blockKind,
  $depth,
  $formBlocks,
  $isHost,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $isShowHideNode,
  $listRun,
  $nested,
  $nextBlock,
  $pageType,
  $prevBlock,
  $setDepth,
  $withNested,
  depthState,
  type OptionNode,
} from "./nodes";
import { type $ssbIds } from "./ssb";

/** One indent level, as drawn: under an option, 14px to the rail's left edge (centred under the 36px marker), the 8px rail, then
 *  36px (GovBB's 48px under 48px markers); inside a show/hide, the 4px rule and 24px. A declaration statement's list starts
 *  at the label's text: the 36px box and its 16px gap. */
export const REVEAL_STEP = 58,
  SECTION_STEP = 28,
  STATEMENT_STEP = 52;

export const REVEAL_RAIL = { left: 14, width: 8 },
  SECTION_RAIL = { left: 0, width: 4 };

/** SSB's fieldConditionalOn (behavior.type.ts), for a block that shows under an answer or inside an open show/hide, on its page. */
export type { FieldConditionalOnBehaviour } from "../adapters/ssb/nesting";

/** New lines take their place; placed lines move out only when their host no longer allows their depth. */
export function $normalizeDepths(root: ElementNode) {
  let prev: LexicalNode | undefined;

  for (const block of $formBlocks(root)) {
    const raw = $getState(block, depthState);
    let depth = raw;

    if (depth === -1) {
      let ahead = $nextBlock(block);

      while (ahead && $getState(ahead, depthState) === -1) ahead = $nextBlock(ahead);
      depth = prev
        ? $depth(prev) + ($isHost(prev) && ahead && $depth(ahead) > $depth(prev) ? 1 : 0)
        : 0;
    }

    const max = !prev || $isPageBreak(block) ? 0 : $depth(prev) + ($isHost(prev) ? 1 : 0);
    depth = Math.min(depth, max);

    if (depth !== raw) $setDepth(block, depth);
    prev = block;
  }
}

/** Every nested block's hosts, outermost first. */
export function $nestPaths() {
  const paths = new Map<NodeKey, LexicalNode[]>();
  const hosts: LexicalNode[] = [];

  for (const block of $formBlocks()) {
    const depth = $depth(block);

    if (depth) paths.set(block.getKey(), hosts.slice(0, depth));
    hosts.length = Math.min(hosts.length, depth);

    if ($isHost(block)) hosts[depth] = block;
  }

  return paths;
}

export function $hostOf(block: LexicalNode) {
  for (let prev = $prevBlock(block); prev; prev = $prevBlock(prev))
    if ($depth(prev) < $depth(block)) return prev;

  return null;
}

export function $onDeclarationPage(node: LexicalNode) {
  for (let prev: LexicalNode | null = node; prev; prev = $prevBlock(prev))
    if ($isPageBreak(prev)) return $pageType(prev) === "declaration";

  return false;
}

export const $canAddFollowUp = (option: LexicalNode) =>
  $isOptionNode(option) && $hasConditionalLogic() && !$onDeclarationPage(option);

export function $addFollowUp(option: OptionNode) {
  if (!$hasConditionalLogic()) throw new Error("Conditional logic is not installed");
  const line = $setDepth($createParagraphNode(), $depth(option) + 1);
  $withNested([option]).at(-1)!.insertAfter(line);

  return line;
}

/** A follow-up leaves after the whole question; a disclosure's content leaves after the disclosure. */
export function $moveOut(block: LexicalNode) {
  const host = $hostOf(block);

  if (!host) return;

  const moving = $withNested(
    $isQuestionNode(block) || $isInput(block) ? $blockGroup(block) : [block],
  );

  const keys = new Set(moving.map((node) => node.getKey()));

  const end = $withNested($isOptionNode(host) ? $blockGroup(host) : [host])
    .filter((node) => !keys.has(node.getKey()))
    .at(-1)!;

  moving.reduce((at, node) => at.insertAfter(node), end);

  for (const node of moving) $setDepth(node, $depth(node) - 1);
}

/** A declaration's same-level list is part of its checkbox label, not a follow-up. */
export function $statementLines(group: LexicalNode[]) {
  const options = group.filter($isOptionNode);
  const option = options[0];

  if (
    options.length !== 1 ||
    !option ||
    $blockKind(option) !== "checkboxes" ||
    !$onDeclarationPage(option)
  )
    return [];
  const next = $nextBlock(option);

  return $isListLine(next) && $depth(next) === $depth(option) ? $listRun(next) : [];
}

const contentKinds = new Set(["paragraph", "h1", "h2", "h3", "bullet", "number"]);

export const $sectionKind = (summary: LexicalNode): "details" | "show-hide" =>
  $nested(summary).every((node) => !$isInput(node) && contentKinds.has($blockKind(node)))
    ? "details"
    : "show-hide";

export function $nestingOf(
  block: LexicalNode,
  paths: ReturnType<typeof $nestPaths>,
  ids: ReturnType<typeof $ssbIds>,
): Nested {
  const path = paths.get(block.getKey());
  const host = path?.at(-1);

  if (!host) return {};

  const section = path!.findLast(
    (node) => $isShowHideNode(node) && $sectionKind(node) === "show-hide",
  );

  // Option indentation is layout. Answer-dependent visibility comes only from logic blocks.
  // The disclosure's own open/closed state is still a native container interaction.
  const shownWhen: FieldConditionalOnBehaviour[] = section
    ? [
        {
          type: "fieldConditionalOn",
          targetFieldId: ids.fields.get($blockId(section))!.id,
          operator: "equal",
          value: true,
        },
      ]
    : [];

  const indent =
    $isOptionNode(host) &&
    (section ||
      ($blockKind(host) === "checkboxes" && $blockGroup(host).filter($isOptionNode).length === 1));

  return {
    depth: $depth(block),
    under: $blockId(host),
    ...(shownWhen.length && { shownWhen }),
    ...(indent && { indent: true }),
  };
}

export { nestingIssues } from "../adapters/ssb/nesting";

/** The nesting is flat in Lexical; the drawn indent and statement alignment follow its hosts. */
export function markNesting(editor: LexicalEditor) {
  return editor.registerUpdateListener(({ editorState }) =>
    editorState.read(
      () => {
        const blocks = $formBlocks();
        const paths = $nestPaths();

        const statement = new Set(
          blocks
            .filter($isOptionNode)
            .flatMap((option) => $statementLines($blockGroup(option)))
            .map((line) => line.getKey()),
        );

        for (const block of blocks) {
          const el = editor.getElementByKey(block.getKey());

          if (!el) continue;
          const path = paths.get(block.getKey());
          const isStatement = statement.has(block.getKey());

          const indent = isStatement
            ? STATEMENT_STEP
            : path?.reduce(
                (sum, host) => sum + ($isShowHideNode(host) ? SECTION_STEP : REVEAL_STEP),
                0,
              );

          if (indent) el.style.setProperty("--nest", `${indent}px`);
          else el.style.removeProperty("--nest");
          el.toggleAttribute("data-nested", !!path?.length);
          el.toggleAttribute("data-statement", isStatement);
        }
      },
      { editor },
    ),
  );
}
