/**
 * block-kit ⇄ BlockNote.
 *
 * BlockNote is the editing surface; the record is still
 * `{version, blocks, refs}` (ADR 0074). Everything crossing that boundary
 * goes through here, which makes this the highest-risk file in the editor:
 * every round-trip guarantee in the suite runs through it.
 *
 * Three mismatches are worth knowing about before reading the code.
 *
 * 1. **Lists.** Our `ListBlock` is one block holding items. BlockNote has no
 *    list container — each item is its own top-level `bulletListItem` /
 *    `numberedListItem`. So one block expands to N, and N collapse back to
 *    one. The container's own id has nowhere to live in BlockNote's model,
 *    so `DocumentMemo` remembers it — as it does a heading's `anchor`, for
 *    the same reason. Losing either renumbers content on every save.
 *
 * 2. **Config block payloads.** BlockNote props are flat primitives; a
 *    finder's configuration is a nested object. It travels as a JSON string
 *    in a single `config` prop. That is ugly, and it is confined to this
 *    boundary — the canonical document never sees it.
 *
 * 3. **Default props.** BlockNote puts `textColor`, `backgroundColor` and
 *    `textAlignment` on every block, and empty `styles: {}` on every text
 *    run. None of it is ours. `fromBlockNote` drops all of it, and omits
 *    `marks` entirely when a span has none, so a document that was not
 *    edited serializes back to exactly what was loaded.
 */

import { safeHref } from "@govtech-bb/block-kit";
import type { Block, ListBlock, Mark, Ref, Span } from "@govtech-bb/block-kit";

/* ----------------------------------------------------------- BlockNote-ish
 * A structural subset of BlockNote's types. Deliberately local: it keeps the
 * adapter unit-testable without standing up an editor, and stops BlockNote's
 * generics leaking into every signature.
 */

export interface BnStyles {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export interface BnText {
  type: "text";
  text: string;
  styles: BnStyles;
}

/** A value reference: a span with a `ref` and no text. */
export interface BnValueRef {
  type: "valueRef";
  props: { refKey: string; field: string };
  content?: undefined;
}

/** BlockNote's link: styled text wrapped in an href. */
export interface BnLink {
  type: "link";
  href: string;
  content: BnText[];
}

export type BnInline = BnText | BnValueRef | BnLink;

export interface BnBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: BnInline[];
  children?: BnBlock[];
}

/* ------------------------------------------------------------------ marks */

const MARK_TO_STYLE: Record<Mark, keyof BnStyles> = {
  strong: "bold",
  em: "italic",
  code: "code",
};

/** Ordered so marks round-trip in a stable sequence, not hash order. */
const STYLE_TO_MARK: Array<[keyof BnStyles, Mark]> = [
  ["bold", "strong"],
  ["italic", "em"],
  ["code", "code"],
];

/** The href a ref points at, or null when it is not a link. */
function hrefOf(ref: Ref | undefined): string | null {
  if (!ref) return null;
  if (ref.kind === "external") return ref.href;
  if (ref.kind === "page") return ref.url;
  return null;
}

export function spansToInline(
  spans: Span[],
  refs: Record<string, Ref> = {},
): BnInline[] {
  return spans.map((span) => {
    // A ref with no text is a value reference; a ref WITH text is a link.
    if (span.ref !== undefined && span.text === undefined) {
      return {
        type: "valueRef",
        props: { refKey: span.ref, field: span.field ?? "" },
      };
    }

    const styles: BnStyles = {};
    for (const mark of span.marks ?? []) styles[MARK_TO_STYLE[mark]] = true;
    const text: BnText = { type: "text", text: span.text ?? "", styles };

    const href = span.ref ? hrefOf(refs[span.ref]) : null;
    return href ? { type: "link", href, content: [text] } : text;
  });
}

/**
 * Turns BlockNote inline content back into spans, minting a ref for any link
 * whose href the document does not already name.
 *
 * `refs` is read AND written: an author typing a new link in the editor has
 * to produce a ref, or validation rule 4 fails on a span pointing at nothing.
 */
export function inlineToSpans(
  content: BnInline[] | undefined,
  refs: Record<string, Ref> = {},
  mintRefKey: () => string = () => `r_${Object.keys(refs).length + 1}`,
): Span[] {
  if (!content) return [];
  const spans: Span[] = [];

  /**
   * The ref for a link's href, minting one when the document does not
   * already name it. Returns null for an href the document is not allowed
   * to hold — pasting a `javascript:` link into the editor then keeps the
   * words and drops the link, rather than storing something the renderer
   * would have to refuse later.
   */
  const keyForHref = (raw: string): string | null => {
    const href = safeHref(raw);
    if (!href) return null;
    for (const [key, ref] of Object.entries(refs)) {
      if (hrefOf(ref) === href) return key;
    }
    const key = mintRefKey();
    refs[key] = href.startsWith("/")
      ? { kind: "page", url: href }
      : { kind: "external", href };
    return key;
  };

  for (const item of content) {
    if (item.type === "link") {
      const key = keyForHref(item.href);
      for (const run of item.content) {
        const marks: Mark[] = [];
        for (const [style, mark] of STYLE_TO_MARK) {
          if (run.styles?.[style]) marks.push(mark);
        }
        const span: Span = { text: run.text };
        if (marks.length > 0) span.marks = marks;
        if (key) span.ref = key;
        spans.push(span);
      }
      continue;
    }

    if (item.type === "valueRef") {
      const span: Span = { ref: item.props.refKey };
      if (item.props.field) span.field = item.props.field;
      spans.push(span);
      continue;
    }

    const marks: Mark[] = [];
    for (const [style, mark] of STYLE_TO_MARK) {
      if (item.styles?.[style]) marks.push(mark);
    }

    // BlockNote splits a run whenever a style boundary falls, so typing into
    // the middle of a paragraph can leave two adjacent runs with identical
    // styling. Merging them keeps an untouched document byte-identical.
    const previous = spans[spans.length - 1];
    if (
      previous &&
      previous.text !== undefined &&
      previous.ref === undefined &&
      sameMarks(previous.marks, marks)
    ) {
      previous.text += item.text;
      continue;
    }

    // `marks` is omitted entirely when empty — the seeded documents have no
    // such key, and adding one would break the byte-identical save.
    spans.push(
      marks.length > 0 ? { text: item.text, marks } : { text: item.text },
    );
  }

  return spans;
}

function sameMarks(a: Mark[] | undefined, b: Mark[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  return left.every((mark, index) => mark === b[index]);
}

/* ------------------------------------------------------------------ lists */

interface ListMemo {
  containerId: string;
  ordered: boolean;
}

/**
 * Everything the canonical document carries that BlockNote's model has
 * nowhere to put.
 *
 * Two things qualify. A `ListBlock`'s own id, because BlockNote has no list
 * container — lose it and `b_sv07` is renumbered on every save. And a
 * heading's `anchor`, because the built-in `heading` block has a fixed prop
 * schema with no room for one.
 *
 * Both could be avoided by replacing BlockNote's blocks with custom ones,
 * at the cost of the native list and `## ` behaviour that is most of why we
 * chose an off-the-shelf editor. A side table is the cheaper trade.
 *
 * Splitting a list in the editor gives one group the original id and mints a
 * fresh one for the other — the correct outcome, since two lists cannot both
 * be the block that was there before.
 */
export class DocumentMemo {
  private byItem = new Map<string, ListMemo>();
  private anchors = new Map<string, string>();

  remember(itemId: string, memo: ListMemo): void {
    this.byItem.set(itemId, memo);
  }

  containerFor(itemIds: string[]): string | undefined {
    for (const id of itemIds) {
      const memo = this.byItem.get(id);
      if (memo) return memo.containerId;
    }
    return undefined;
  }

  rememberAnchor(blockId: string, anchor: string): void {
    this.anchors.set(blockId, anchor);
  }

  anchorFor(blockId: string): string | undefined {
    return this.anchors.get(blockId);
  }

  clear(): void {
    this.byItem.clear();
    this.anchors.clear();
  }
}

const LIST_TYPES = new Set(["bulletListItem", "numberedListItem"]);

/* ------------------------------------------------- config block payloads */

/** Block types whose configuration travels as a JSON string prop. */
const CONFIG_TYPES = new Set([
  "finder",
  "calendar",
  "data_table",
  "contact",
  "start_link",
  "image_placeholder",
]);

export function isConfigType(type: string): boolean {
  return CONFIG_TYPES.has(type);
}

/* --------------------------------------------------------------- outward */

export function toBlockNote(
  blocks: Block[],
  registry: DocumentMemo,
  refs: Record<string, Ref> = {},
): BnBlock[] {
  registry.clear();
  const out: BnBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        out.push({
          id: block.id,
          type: "paragraph",
          content: spansToInline(block.content, refs),
        });
        break;

      case "heading":
        // `anchor` is a URL fragment someone has linked to. BlockNote's
        // heading has no prop for it, so it lives in the memo.
        registry.rememberAnchor(block.id, block.anchor);
        out.push({
          id: block.id,
          type: "heading",
          props: { level: block.level },
          content: spansToInline(block.content, refs),
        });
        break;

      case "notice":
        out.push({
          id: block.id,
          type: "notice",
          props: { variant: block.variant },
          content: spansToInline(block.content, refs),
        });
        break;

      case "list":
        for (const item of block.items) {
          registry.remember(item.id, {
            containerId: block.id,
            ordered: block.ordered,
          });
          out.push({
            id: item.id,
            type: block.ordered ? "numberedListItem" : "bulletListItem",
            content: spansToInline(item.content, refs),
          });
        }
        break;

      default:
        // Every configuration block: no editable text, payload as JSON.
        out.push({
          id: block.id,
          type: block.type,
          props: { config: JSON.stringify(stripId(block)) },
        });
    }
  }

  return out;
}

function stripId(block: Block): Record<string, unknown> {
  const { id: _id, ...rest } = block as unknown as Record<string, unknown> & {
    id: string;
  };
  return rest;
}

/* ---------------------------------------------------------------- inward */

export interface Deserialized {
  blocks: Block[];
  /** The document's refs, with any link typed in the editor added. */
  refs: Record<string, Ref>;
}

export function fromBlockNote(
  bnBlocks: BnBlock[],
  registry: DocumentMemo,
  mintId: () => string,
  existingRefs: Record<string, Ref> = {},
): Deserialized {
  const refs: Record<string, Ref> = { ...existingRefs };
  const out: Block[] = [];
  let index = 0;

  while (index < bnBlocks.length) {
    const bn = bnBlocks[index];

    if (LIST_TYPES.has(bn.type)) {
      const ordered = bn.type === "numberedListItem";
      const group: BnBlock[] = [];
      // A run of same-kind list items is one ListBlock. A different kind or
      // any other block ends it.
      while (index < bnBlocks.length && bnBlocks[index].type === bn.type) {
        group.push(bnBlocks[index]);
        index += 1;
      }
      const itemIds = group.map((item) => item.id);
      const list: ListBlock = {
        id: registry.containerFor(itemIds) ?? mintId(),
        type: "list",
        ordered,
        items: group.map((item) => ({
          id: item.id,
          content: inlineToSpans(item.content, refs),
        })),
      };
      out.push(list);
      continue;
    }

    index += 1;

    switch (bn.type) {
      case "paragraph":
        out.push({
          id: bn.id,
          type: "paragraph",
          content: inlineToSpans(bn.content, refs),
        });
        break;

      case "heading":
        out.push({
          id: bn.id,
          type: "heading",
          level: (bn.props?.level as 2 | 3) ?? 2,
          // Remembered from load, so retyping the heading text never
          // silently changes the fragment. A brand-new heading has none,
          // and `deriveAnchors` mints one from its text.
          anchor: registry.anchorFor(bn.id) ?? "",
          content: inlineToSpans(bn.content, refs),
        });
        break;

      case "notice":
        out.push({
          id: bn.id,
          type: "notice",
          variant: (bn.props?.variant as "info" | "warning") ?? "info",
          content: inlineToSpans(bn.content, refs),
        });
        break;

      default: {
        if (!isConfigType(bn.type)) {
          // Anything else BlockNote can produce — a table from a paste, a
          // code block, a checklist — is not in the palette and has no home
          // in the document. Dropping it is the closed palette holding.
          break;
        }
        const config = JSON.parse(String(bn.props?.config ?? "{}"));
        out.push({ id: bn.id, ...config } as Block);
      }
    }
  }

  return { blocks: out, refs };
}
