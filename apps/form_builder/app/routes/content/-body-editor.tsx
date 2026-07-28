import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import {
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  PlayCircleIcon,
  QuoteUpIcon,
  Table01Icon,
  TextBoldIcon,
  TextItalicIcon,
} from "hugeicons-react";
import { type StartLinkType } from "./-lib";
import { SlidingTabs, Tip } from "./-sliding-tabs";
import s from "./-styles.module.css";

interface BodyEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** The page's start-link type — hides the Start button tool when "none". */
  linkType: StartLinkType;
}

const TABLE_HTML = `<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td>Text</td><td>Text</td></tr><tr><td>Text</td><td>Text</td></tr></tbody></table><p></p>`;

/** HTML → markdown, configured to match how the landing content is written. */
const turndown = (() => {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  gfm(td);
  // The Start button marker survives as the canonical raw tag, rebuilt clean
  // from the DOM node — the label comes from the editable label span (never
  // the drag grip), and editor-only attributes are dropped.
  td.addRule("startLink", {
    filter: (node) =>
      node.nodeName === "A" && node.hasAttribute("data-start-link"),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const href = el.getAttribute("href");
      const label =
        el.querySelector("[data-label]")?.textContent?.trim() ||
        el.textContent?.trim() ||
        "Start now";
      return `<a data-start-link${href ? ` href="${href}"` : ""}>${label}</a>`;
    },
  });
  // Landing content uses literal <br /> to keep address lines together.
  td.addRule("br", {
    filter: "br",
    replacement: () => "<br />\n",
  });
  return td;
})();

function mdToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
}

function htmlToMd(html: string): string {
  return turndown.turndown(html).trim();
}

/**
 * A lightweight TinyMCE-style WYSIWYG for the page body — a contentEditable
 * surface (no editor framework) with markdown as the storage format
 * (`marked` in, `turndown` out). Content designers see formatted text, never
 * syntax; the Markdown tab stays available for power users. The Start button
 * is an atomic green chip: place/move it from the toolbar, double-click it to
 * rename, backspace to remove.
 */
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

export function BodyEditor({ value, onChange, linkType }: BodyEditorProps) {
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  // The block style at the caret, reflected in the typography dropdown.
  const [blockFormat, setBlockFormat] = useState("p");
  const divRef = useRef<HTMLDivElement>(null);
  // The markdown we last emitted; an external change (page load, markdown-tab
  // edits) re-renders the visual surface from `value`.
  const lastEmitted = useRef<string | null>(null);

  /**
   * Upgrade Start markers into interactive chips after any (re)load: the
   * anchor itself is non-editable, with a draggable grip on the left and an
   * editable label span — so the text is typed directly and the chip is moved
   * by dragging the grip.
   */
  const decorateChips = () => {
    divRef.current
      ?.querySelectorAll<HTMLElement>("a[data-start-link]")
      .forEach((el) => {
        el.setAttribute("contenteditable", "false");
        if (!el.querySelector("[data-label]")) {
          const label = el.textContent?.trim() || "Start now";
          el.textContent = "";
          const grip = document.createElement("span");
          grip.setAttribute("data-grip", "");
          grip.setAttribute("draggable", "true");
          grip.setAttribute("contenteditable", "false");
          grip.title = "Drag to move the Start button";
          grip.textContent = "⠿";
          const text = document.createElement("span");
          text.setAttribute("data-label", "");
          text.setAttribute("contenteditable", "true");
          text.title = "Click to edit the button label";
          text.textContent = label;
          el.append(grip, text);
        }
      });
  };

  const syncFromDom = () => {
    const el = divRef.current;
    if (!el) return;
    const md = htmlToMd(el.innerHTML);
    lastEmitted.current = md;
    onChange(md);
  };

  // Typing performance: keystrokes hit the native contentEditable instantly;
  // the (whole-document) HTML→markdown conversion and parent re-render are
  // debounced behind them, and flushed on blur so nothing is ever stale when
  // the author clicks Deploy.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(syncFromDom, 250);
  };
  const flushSync = () => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
      syncTimer.current = null;
    }
    syncFromDom();
  };
  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  // Paint the editable surface whenever it (re)mounts — switching back from
  // the Markdown tab mounts an empty div, so this must run unconditionally or
  // the next keystroke would sync emptiness over the real content.
  useEffect(() => {
    if (mode !== "visual") return;
    const el = divRef.current;
    if (!el) return;
    el.innerHTML = mdToHtml(value);
    decorateChips();
    lastEmitted.current = value;
  }, [mode]);

  // Repaint on external value changes (page load, reset) — but never for our
  // own emissions (would nuke the caret mid-typing).
  useEffect(() => {
    if (mode !== "visual") return;
    if (value === lastEmitted.current) return;
    const el = divRef.current;
    if (!el) return;
    el.innerHTML = mdToHtml(value);
    decorateChips();
    lastEmitted.current = value;
  }, [value, mode]);

  // Keep the typography dropdown in sync with wherever the caret sits.
  useEffect(() => {
    if (mode !== "visual") return;
    const onSelectionChange = () => {
      const root = divRef.current;
      const node = window.getSelection()?.anchorNode;
      if (!root || !node || !root.contains(node)) return;
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
      const block = el?.closest("h1,h2,h3,h4,h5,h6,p,li,blockquote");
      const tag = block?.tagName.toLowerCase() ?? "p";
      setBlockFormat(HEADING_TAGS.includes(tag) ? tag : "p");
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [mode]);

  const exec = (command: string, arg?: string) => {
    divRef.current?.focus();
    document.execCommand(command, false, arg);
    decorateChips();
    syncFromDom();
  };

  const insertLink = () => {
    const url = window.prompt("Link address (https://… or /internal/path):");
    if (url) exec("createLink", url);
  };

  const chipLabel = (el: HTMLElement | null): string =>
    el?.querySelector("[data-label]")?.textContent?.trim() ||
    el?.textContent?.trim() ||
    "Start now";

  const placeStartButton = () => {
    const el = divRef.current;
    if (!el) return;
    // One button per page: capture its label, remove it, reinsert at caret.
    const existing = el.querySelector<HTMLElement>("a[data-start-link]");
    const label = chipLabel(existing);
    const href = existing?.getAttribute("href");
    existing?.parentElement?.removeChild(existing);
    el.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<a data-start-link${href ? ` href="${href}"` : ""} contenteditable="false">${label}</a>`,
    );
    decorateChips();
    syncFromDom();
  };

  // Drag & drop: the chip's grip starts a drag; while dragging, the caret
  // follows the pointer for live placement feedback; dropping moves the chip.
  const draggingChip = useRef(false);

  const rangeFromPoint = (x: number, y: number): Range | null => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
    };
    if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (!pos) return null;
    const r = document.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  };

  const onDragStart = (e: React.DragEvent) => {
    const grip = (e.target as HTMLElement).closest?.("[data-grip]");
    if (!grip) return;
    draggingChip.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "start-button");
    const chip = grip.closest("a[data-start-link]");
    if (chip) e.dataTransfer.setDragImage(chip, 20, 14);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!draggingChip.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = rangeFromPoint(e.clientX, e.clientY);
    if (r) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    if (!draggingChip.current) return;
    e.preventDefault();
    draggingChip.current = false;
    const el = divRef.current;
    const chip = el?.querySelector<HTMLElement>("a[data-start-link]");
    const range = rangeFromPoint(e.clientX, e.clientY);
    if (!el || !chip || !range) return;
    // Dropping inside the chip itself is a no-op.
    if (chip.contains(range.startContainer)) return;
    chip.remove();
    range.insertNode(chip);
    decorateChips();
    syncFromDom();
  };

  const onDragEnd = () => {
    draggingChip.current = false;
  };

  const hasMarker = value.includes("data-start-link");
  const hasButton = linkType !== "none";

  const tool = (title: string, icon: React.ReactNode, onClick: () => void) => (
    <Tip label={title}>
      <button
        type="button"
        className={s.toolBtn}
        aria-label={title}
        // mousedown + preventDefault keeps the text selection in the editor.
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
      >
        {icon}
      </button>
    </Tip>
  );

  return (
    <div className={s.bodyEditor}>
      <div className={s.bodyToolbar}>
        {mode === "visual" && (
          <>
            <select
              className={s.toolSelect}
              value={blockFormat}
              aria-label="Text style"
              title="Text style"
              onChange={(e) => exec("formatBlock", e.target.value)}
            >
              <option value="p">Normal</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="h5">Heading 5</option>
              <option value="h6">Heading 6</option>
            </select>
            <span className={s.toolSep} />
            {tool("Bold", <TextBoldIcon size={15} />, () => exec("bold"))}
            {tool("Italic", <TextItalicIcon size={15} />, () => exec("italic"))}
            <span className={s.toolSep} />
            {tool("Bullet list", <LeftToRightListBulletIcon size={15} />, () =>
              exec("insertUnorderedList"),
            )}
            {tool(
              "Numbered list",
              <LeftToRightListNumberIcon size={15} />,
              () => exec("insertOrderedList"),
            )}
            {tool("Quote", <QuoteUpIcon size={15} />, () =>
              exec("formatBlock", "blockquote"),
            )}
            <span className={s.toolSep} />
            {tool("Link", <Link01Icon size={15} />, insertLink)}
            {tool("Table", <Table01Icon size={15} />, () =>
              exec("insertHTML", TABLE_HTML),
            )}
            {tool("Divider line", <MinusSignIcon size={15} />, () =>
              exec("insertHTML", "<hr><p></p>"),
            )}
            {hasButton && (
              <button
                type="button"
                className={`${s.toolBtn} ${s.toolBtnStart}`}
                title="Insert the Start button at the cursor (moves it if it already exists)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  placeStartButton();
                }}
              >
                <PlayCircleIcon size={15} />
                {hasMarker ? "Move Start button" : "Place Start button"}
              </button>
            )}
          </>
        )}
        <SlidingTabs
          className={s.modeToggleEnd}
          ariaLabel="Editing mode"
          options={[
            { key: "visual", label: "Visual" },
            { key: "markdown", label: "Markdown" },
          ]}
          value={mode}
          onChange={(m) => {
            if (m === "markdown" && mode === "visual") flushSync();
            setMode(m);
          }}
        />
      </div>

      {mode === "markdown" ? (
        <textarea
          id="sp-body"
          className={`${s.textarea} ${s.mono} ${s.bodyTextarea}`}
          rows={18}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write the page in markdown…"
        />
      ) : (
        <>
          <div
            ref={divRef}
            className={s.richBody}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Page body"
            onInput={scheduleSync}
            onBlur={flushSync}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
          {hasButton && !hasMarker && (
            <small className={s.help}>
              The Start button will be added at the end of the page — use “Place
              Start button” to position it yourself.
            </small>
          )}
        </>
      )}
    </div>
  );
}
