import { $getSelection, $isRangeSelection, type LexicalNode } from "lexical";
import type { TurnInto } from "../../editor/core/turn-into";
import { calloutEntries } from "../../editor/modules/callouts/insertion";
import { disclosureEntries } from "../../editor/modules/disclosure/insertion";
import { headingEntries } from "../../editor/modules/headings/insertion";
import { listEntries } from "../../editor/modules/lists/insertion";
import { textEntries } from "../../editor/modules/text/insertion";
import { $blockKind, $settingsHolder, $turnInto, $turnIntoGroups } from "./nodes";
import { $selectedBlocks, $sorted } from "./structure/blocks";
import { questionLabelEntry } from "./structure/insertion";

/** The shortcuts that turn a form's blocks into a kind of text block, by the kind. */
export const textBlockKeys = new Map<string, readonly string[]>([
  ["paragraph", ["mod", "alt", "0"]],
  ["h1", ["mod", "alt", "1"]],
  ["h2", ["mod", "alt", "2"]],
  ["h3", ["mod", "alt", "3"]],
  ["bullet", ["mod", "shift", "8"]],
  ["number", ["mod", "shift", "7"]],
]);

// The insert actions that make a form's text blocks, with the kind of block each makes
const entries = [
  ...textEntries,
  questionLabelEntry,
  ...headingEntries,
  ...listEntries,
  ...calloutEntries,
  ...disclosureEntries,
];

// The kinds of text block, in the block menu's order
const $textKinds = () => $turnIntoGroups().at(-1) ?? [];

/**
 * The blocks selected, or those the selection's text is in; null unless every one is a text block of its own, as the
 * block menu offers them. A question's label goes with its answer, which turns into other answers instead.
 */
function $textBlocks(): LexicalNode[] | null {
  const selection = $getSelection();
  const selected = $selectedBlocks();

  const blocks = selected.length
    ? selected
    : $isRangeSelection(selection)
      ? $sorted(selection.getNodes().flatMap((node) => node.getTopLevelElement() ?? []))
      : [];

  const kinds = $textKinds();

  return blocks.length &&
    blocks.every(
      (block) =>
        $settingsHolder(block).is(block) && kinds.some(([kind]) => kind === $blockKind(block)),
    )
    ? blocks
    : null;
}

/** Turn into, for a form's text blocks: text, question labels, headings, lists, callouts and Details. */
export const formTurnInto: TurnInto = {
  $choices() {
    const blocks = $textBlocks();

    if (!blocks) return null;
    const kinds = new Set(blocks.map($blockKind));
    const only = kinds.size === 1 ? [...kinds][0] : undefined;

    return {
      value: entries.find((entry) => entry.kind === only)?.id ?? null,
      choices: $textKinds().flatMap(([kind, label]) => {
        const entry = entries.find((item) => item.kind === kind);

        return entry
          ? [{ value: entry.id, label, icon: entry.icon, keys: textBlockKeys.get(kind) }]
          : [];
      }),
    };
  },
  $turnInto(value) {
    const kind = entries.find((entry) => entry.id === value)?.kind;

    // Turning one line of a list turns the list, so its other lines may be gone already
    if (kind)
      for (const block of $textBlocks() ?? []) if (block.isAttached()) $turnInto(block, kind);
  },
};
