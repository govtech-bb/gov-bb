import { Popover } from "@base-ui/react/popover";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  mergeRegister,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useEffect, useId, useState } from "react";
import { cn } from "../../../cn";
import { panel } from "../../../ui/select";
import { Tip } from "../../../ui/tooltip";
import { SsbField } from "../../react/settings-controls";
import { $pageBlocks, $isPageBreak, $setSettings, $settings } from "../../editor/nodes";
import { $ssbIds } from "../../editor/ssb";
import { $native } from "../../editor/native-state";
import { checkId, RESERVED_PAGE_IDS, type Resolved } from "../../core/identities";
import { $pageRepeat, $repeatEnd } from "../repetition/queries";
import {
  toSettings,
  type PageRepeat,
  type Repeatable,
  type RepeatEnd,
} from "../../core/repetition";
import { RepeatEndPreview, RepeatSettings } from "../repetition/presentation";

/** A page's button: the page break that starts its page (the form title for page 1), and where it sits. */
type PageButtonAt = {
  key: NodeKey;
  label: string;
  previous: boolean;
  backLabel: string;
  pageId: Resolved;
  takenIds: string[];
  repeat?: PageRepeat;
  repeatEnd?: RepeatEnd;
  /** What the label is when the author hasn't set one: "Continue", or "Submit" on the last page. */
  fallback: string;
  /** The page's last block, for clicks beside the button. */
  last: NodeKey;
  /** Px from the editor's top, for buttons above a page break; undefined for the last page's, under the editor. */
  top?: number;
};

/**
 * Button text belongs to each page's first node: the form title on page 1, otherwise its page break.
 * The last question page defaults to Submit; earlier pages use Continue.
 * Confirmation pages, folded pages and a form containing only its title have no button.
 */
export function $pageButtons() {
  const [title, ...blocks] = $getRoot().getChildren();
  const buttons: (Omit<PageButtonAt, "top"> & { before?: NodeKey })[] = [];

  if (!title || !blocks.length) return buttons;
  const { pages } = $ssbIds();
  let start: LexicalNode = title;
  let last: LexicalNode = title;

  const end = (before: LexicalNode | undefined) => {
    const { confirmation, folded, button } = $settings(start);

    // Page 1 needs a block besides its head; later pages count their page break
    if (
      confirmation ||
      $native(start).page?.role === "result" ||
      folded ||
      (start === title && !$pageBlocks(title).length)
    )
      return;
    const fallback = !before || $settings(before).confirmation ? "Submit" : "Continue";
    const label = typeof button === "string" && button.trim() ? button : fallback;
    const key = start.getKey();
    const backLabel = $native(start).page?.navigation?.backLabel ?? "Back";
    buttons.push({
      key,
      label,
      previous: start !== title,
      backLabel,
      pageId: pages.get(key)!,
      takenIds: [...pages].flatMap(([other, page]) => (other !== key ? [page.id] : [])),
      repeat: $pageRepeat(start),
      repeatEnd: $repeatEnd(start) ?? undefined,
      fallback,
      last: last.getKey(),
      before: before?.getKey(),
    });
  };

  for (const block of blocks) {
    if ($isPageBreak(block)) {
      end(block);
      start = block;
    }

    last = block;
  }

  end(undefined);

  return buttons;
}

// The button row: 8px over a 52px GovBB button (the answer above already has its gap)
const BUTTON_ROW = 60;

/**
 * Keeps the page buttons in step with the form: page breaks keep room above for theirs (data-page-button). Only
 * editor updates change that room; a resize just re-reads where the buttons go, a frame later, so the ResizeObserver
 * never changes layout from its callback (Chrome's "ResizeObserver loop" error).
 */
function usePageButtons(editor: LexicalEditor) {
  const [buttons, setButtons] = useState<PageButtonAt[]>([]);
  useEffect(() => {
    let pages: ReturnType<typeof $pageButtons> = [];

    const place = () => {
      const next = pages.map(({ before, ...page }) => {
        const el = before ? editor.getElementByKey(before) : null;

        return { ...page, top: el ? el.offsetTop - BUTTON_ROW : undefined };
      });

      setButtons((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };

    const update = () => {
      pages = editor.getEditorState().read($pageButtons, { editor });

      const above = new Set<Element | null | undefined | "">(
        pages.map((p) => p.before && editor.getElementByKey(p.before)),
      );

      for (const el of editor.getRootElement()?.children ?? [])
        el.toggleAttribute("data-page-button", above.has(el));
      place();
    };

    let frame = 0;

    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    });

    const root = editor.getRootElement();

    if (root) resize.observe(root);
    update();

    return mergeRegister(editor.registerUpdateListener(update), () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    });
  }, [editor]);

  return buttons;
}

export function PageButtons() {
  const [editor] = useLexicalComposerContext();

  return usePageButtons(editor).map((button) =>
    button.top === undefined ? (
      <PageButton key={button.key} editor={editor} button={button} />
    ) : (
      <div key={button.key} className="absolute inset-x-0" style={{ top: button.top }}>
        <PageButton editor={editor} button={button} />
      </div>
    ),
  );
}

/** Preview the page's submit or continue button; clicking beside it creates a text line. */
function PageButton({ editor, button }: { editor: LexicalEditor; button: PageButtonAt }) {
  const [open, setOpen] = useState(false);
  const field = useId();

  // The field sits outside the editor: keep Lexical from pulling the focus back into it
  const setLabel = (label: string) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        if (!editor.isEditable()) return;
        const node = $getNodeByKey(button.key);

        if (node) $setSettings(node, { button: label.trim() ? label : undefined });
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  };

  const setPageId = (pageId: string | undefined) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        if (!editor.isEditable()) return;
        const node = $getNodeByKey(button.key);

        if (node) $setSettings(node, { pageId });
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  };

  const setRepeat = (next: Repeatable | undefined) => {
    if (!editor.isEditable()) return;
    editor.update(
      () => {
        if (!editor.isEditable()) return;
        const node = $getNodeByKey(button.key);

        if (node) $setSettings(node, { repeatable: toSettings(next) });
      },
      { tag: SKIP_DOM_SELECTION_TAG },
    );
  };

  const lineAfter = () => {
    if (!editor.isEditable()) return;
    editor.update(() => {
      if (!editor.isEditable()) return;
      const last = $getNodeByKey(button.last);

      if (!last) return;

      if ($isParagraphNode(last) && last.isEmpty()) return last.selectEnd();
      last.insertAfter($createParagraphNode()).selectStart();
    });
  };

  const custom = button.label !== button.fallback;

  return (
    <div
      data-page-button-row=""
      className="relative cursor-text px-25 pt-2 max-sm:px-6.25"
      onClick={lineAfter}
    >
      {button.repeatEnd && (
        <Tip content="Click to change how this page repeats">
          <div
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <RepeatEndPreview end={button.repeatEnd} />
          </div>
        </Tip>
      )}
      {button.previous && (
        <span
          aria-hidden="true"
          onClick={(e) => e.stopPropagation()}
          className="mr-3 inline-flex h-(--form-control) cursor-default items-center rounded-sm bg-line px-5 text-(length:--form-text) text-ink select-none"
        >
          {button.backLabel}
        </span>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Tip content="Edit button text. The button does nothing in the builder.">
          <Popover.Trigger
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-(--form-control) cursor-pointer items-center rounded-sm bg-interactive px-5 text-(length:--form-text) text-white outline-offset-2 transition-colors hover:bg-interactive-active focus-visible:outline-3 focus-visible:outline-focus"
          >
            {button.label}
          </Popover.Trigger>
        </Tip>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            className="z-50 outline-none"
          >
            <Popover.Popup
              onClick={(e) => e.stopPropagation()}
              className={cn(
                panel,
                "w-72 p-3 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
              )}
            >
              <label
                htmlFor={field}
                className="mb-1.5 block text-14 leading-5 font-semibold text-ink"
              >
                Button text
              </label>
              <input
                id={field}
                autoFocus
                defaultValue={custom ? button.label : ""}
                placeholder={button.fallback}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
                className="h-9 w-full rounded-sm bg-white px-2.5 text-14 text-ink shadow-input outline-none placeholder:text-placeholder hover:shadow-input-hover focus:shadow-input-focus max-sm:text-16"
              />
              <p className="mt-2 text-12 leading-4 text-muted">
                {button.fallback === "Submit"
                  ? "Leave blank to use “Submit”, or name the action, such as “Submit application”."
                  : "Leave blank to use “Continue”."}
              </p>
              <div className="-mx-3.5 mt-2">
                <SsbField
                  label="Page ID"
                  value={button.pageId.id}
                  pinned={button.pageId.pinned}
                  fixed={button.pageId.fixed}
                  clash={button.pageId.clash}
                  mono
                  validate={(id) =>
                    checkId(id, new Set(button.takenIds), RESERVED_PAGE_IDS, "page")
                  }
                  onChange={setPageId}
                />
              </div>
              {button.repeat && <RepeatSettings repeat={button.repeat} onChange={setRepeat} />}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
