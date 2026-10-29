import { useEditable, useEditableUpdate } from "./logic-hooks";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { CaretDown, CaretRight, DotsThree } from "@phosphor-icons/react";
import { useEffect, useReducer, type MouseEvent } from "react";
import { cn } from "../../cn";
import { Button } from "../../ui/button";
import { Kbd } from "../../ui/kbd";
import { Tip } from "../../ui/tooltip";
import { $addTitle, $foldableTitle, $foldQuestion, $isUntitled } from "../editor/structure";
import {
  $blockGroup,
  $formBlocks,
  $isFoldedAway,
  $isOptionNode,
  $isQuestionNode,
  $settings,
  $withNested,
} from "../editor/nodes";
import { $canAddFollowUp } from "../editor/nesting";
import { foldShortcut } from "../editor/structure/keyboard";
import { shortcut } from "../../editor/react/shortcut";

// Measure block controls outside contenteditable so they do not become editable content.

// Buttons keep the editor's focus, and with it the caret
const keepCaret = (e: MouseEvent) => e.preventDefault();

/**
 * Re-renders after every editor update and size change, for chrome that measures the blocks. A resize
 * re-measures a frame later, so the observer never changes layout from its callback (Chrome's "ResizeObserver loop").
 */
export function useLayout(anchor: HTMLElement) {
  const [editor] = useLexicalComposerContext();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let frame = 0;

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(rerender);
    });

    observer.observe(anchor);
    const unregister = editor.registerUpdateListener(rerender);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      unregister();
    };
  }, [anchor, editor]);

  return editor;
}

/** The top-level block the caret is in, while the editor has the focus. */
function $caretBlock(editor: LexicalEditor) {
  const selection = $getSelection();
  const focused = document.activeElement === editor.getRootElement();

  return focused && $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()?.getKey()
    : undefined;
}

export function FoldActions({ anchor, hovered }: { anchor: HTMLElement; hovered: NodeKey | null }) {
  const editor = useLayout(anchor);
  const editable = useEditable();
  const update = useEditableUpdate();

  if (!editable) return null;
  const box = anchor.getBoundingClientRect();

  const folds = editor.getEditorState().read(
    () => {
      const caret = $caretBlock(editor);

      return $formBlocks().flatMap((block) => {
        const dom = editor.getElementByKey(block.getKey());
        const text = dom?.querySelector("h2");

        if (
          !dom ||
          !text ||
          !$isQuestionNode(block) ||
          $foldableTitle(block) !== block ||
          $isFoldedAway(block)
        )
          return [];
        const range = document.createRange();
        range.selectNodeContents(text);
        // The label's last line (its "(optional)" is in the label); an empty title, its placeholder's line: the label's box
        // without its padding (the label fits its text, so its right edge is the placeholder's)
        const own = block.getTextContentSize() ? [...range.getClientRects()].at(-1) : undefined;
        const rect = text.getBoundingClientRect();
        const style = getComputedStyle(text);

        const line = own ?? {
          right: rect.right,
          top: rect.top + parseFloat(style.paddingTop),
          height: parseFloat(style.lineHeight) || 27,
        };

        const group = $withNested($blockGroup(block)).map((b) => b.getKey());
        const active = [hovered, caret].some((key) => key && group.includes(key));

        return [
          {
            key: block.getKey(),
            active,
            folded: !!$settings(block).folded,
            count: group.length - 1,
            left: line.right + 6 - box.left,
            // The middle of the line: the button centres on it, 24px or, on a touch screen, 44px
            top: line.top + line.height / 2 - box.top,
          },
        ];
      });
    },
    { editor },
  );

  return folds.map(({ key, active, folded, count, left, top }) => {
    const blocks = `${count} block${count === 1 ? "" : "s"}`;
    // The name has the count the folded button shows, and says what pressing it does; aria-expanded says the state
    const label = `${folded ? "Unfold" : "Fold"} ${blocks}`;

    return (
      <div
        key={key}
        className={cn(
          "absolute z-2 flex -translate-y-1/2 items-center",
          !folded && !active && "opacity-0 focus-within:opacity-100 hover:opacity-100",
        )}
        style={{ left, top }}
      >
        <Tip
          hint
          align="start"
          content={
            <>
              <em>{label}</em>
              <br />
              <Kbd>{shortcut(foldShortcut(!folded))}</Kbd>
            </>
          }
        >
          <Button
            size="xs"
            aria-label={label}
            aria-expanded={!folded}
            className="min-w-6"
            icon={folded ? <DotsThree /> : <CaretDown />}
            iconEnd={folded ? <CaretRight /> : undefined}
            onMouseDown={keepCaret}
            onClick={() =>
              update(() => {
                const node = $getNodeByKey(key);

                if (node) $foldQuestion(node, !folded);
              })
            }
          >
            {folded ? blocks : undefined}
          </Button>
        </Tip>
      </div>
    );
  });
}

/** Offer a question label on unlabelled inputs, using only the first option in choice questions. */
export function TitleHints({
  anchor,
  hovered,
  onFollowUp,
}: {
  anchor: HTMLElement;
  hovered: NodeKey | null;
  onFollowUp?: (option: NodeKey) => void;
}) {
  const editor = useLayout(anchor);
  const editable = useEditable();
  const update = useEditableUpdate();

  if (!editable) return null;
  const box = anchor.getBoundingClientRect();

  const hints = editor.getEditorState().read(
    () => {
      const selection = $getSelection();

      return [...new Set([hovered, $caretBlock(editor)])].flatMap((key) => {
        const node = key ? $getNodeByKey(key) : null;
        const dom = key ? editor.getElementByKey(key) : null;

        if (!key || !node || !dom || ($isNodeSelection(selection) && selection.has(key))) return [];
        const title = $showsHints(node);
        const followUp = $isOptionNode(node) && !$isFoldedAway(node) && $canAddFollowUp(node);

        if (!title && !followUp) return [];

        // Right of the input box, the option's card, the date's boxes, or the widget
        const r = (
          dom.querySelector("[data-card]") ??
          dom.querySelector("[data-date], [data-drawn]:not([data-repeat-legend])") ??
          dom
        ).getBoundingClientRect();

        return [{ key, title, followUp, left: r.right + 20 - box.left, top: r.top - box.top }];
      });
    },
    { editor },
  );

  const add = (key: NodeKey) =>
    update(() => {
      const node = $getNodeByKey(key);

      if (node) $addTitle(node);
    });

  return hints.map(({ key, title, followUp, left, top }) => (
    <div
      key={key}
      className="absolute z-3 flex h-9 w-70 items-center gap-5 max-xl:hidden in-data-dragging:hidden"
      style={{ left, top }}
    >
      {title && <Hint label="Add question label" letter="T" onClick={() => add(key)} />}
      {followUp && (
        <Hint
          label="Add follow-up"
          letter="↵"
          onClick={() => {
            if (editor.isEditable()) onFollowUp?.(key);
          }}
        />
      )}
    </div>
  ));
}

function $showsHints(node: LexicalNode) {
  if (!$isUntitled(node) || $isFoldedAway(node)) return false;

  if ($isOptionNode(node)) return $blockGroup(node)[0]!.is(node);

  return true;
}

function Hint({ label, letter, onClick }: { label: string; letter: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={keepCaret}
      onClick={onClick}
      className="flex h-9 cursor-pointer items-center gap-2 text-14 text-muted hover:text-ink"
    >
      <span>{label}</span>
      <Kbd>{shortcut(["alt"])}</Kbd>
      <Kbd>{letter}</Kbd>
    </button>
  );
}
