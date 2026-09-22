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
 *    so `ListRegistry` remembers it. Losing it would renumber `b_sv07` on
 *    every save.
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

import type { Block, ListBlock, Mark, Span } from "@govtech-bb/block-kit";

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

export type BnInline = BnText | BnValueRef;

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

export function spansToInline(spans: Span[]): BnInline[] {
  return spans.map((span) => {
    if (span.ref !== undefined && span.text === undefined) {
      return {
        type: "valueRef",
        props: { refKey: span.ref, field: span.field ?? "" },
      };
    }
    const styles: BnStyles = {};
    for (const mark of span.marks ?? []) styles[MARK_TO_STYLE[mark]] = true;
    return { type: "text", text: span.text ?? "", styles };
  });
}

export function inlineToSpans(content: BnInline[] | undefined): Span[] {
  if (!content) return [];
  const spans: Span[] = [];

  for (const item of content) {
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
 * Remembers which `ListBlock` each list item came out of, because BlockNote
 * has nowhere to put the container's id.
 *
 * Splitting a list in the editor gives one group the original id and mints a
 * fresh one for the other — which is the correct outcome, since two lists
 * cannot both be the block that was there before.
 */
export class ListRegistry {
  private byItem = new Map<string, ListMemo>();

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

  clear(): void {
    this.byItem.clear();
  }
}

const LIST_TYPES = new Set(["bulletListItem", "numberedListItem"]);

/* ------------------------------------------------- config block payloads */

/** Block types whose configuration travels as a JSON string prop. */
const CONFIG_TYPES = new Set([
  "finder",
  "calendar",
  "data_table",
  "start_link",
  "image_placeholder",
]);

export function isConfigType(type: string): boolean {
  return CONFIG_TYPES.has(type);
}

/* --------------------------------------------------------------- outward */

export function toBlockNote(
  blocks: Block[],
  registry: ListRegistry,
): BnBlock[] {
  registry.clear();
  const out: BnBlock[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        out.push({
          id: block.id,
          type: "paragraph",
          content: spansToInline(block.content),
        });
        break;

      case "heading":
        out.push({
          id: block.id,
          type: "heading",
          props: { level: block.level, anchor: block.anchor },
          content: spansToInline(block.content),
        });
        break;

      case "notice":
        out.push({
          id: block.id,
          type: "notice",
          props: { variant: block.variant },
          content: spansToInline(block.content),
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
            content: spansToInline(item.content),
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

export function fromBlockNote(
  bnBlocks: BnBlock[],
  registry: ListRegistry,
  mintId: () => string,
): Block[] {
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
          content: inlineToSpans(item.content),
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
          content: inlineToSpans(bn.content),
        });
        break;

      case "heading":
        out.push({
          id: bn.id,
          type: "heading",
          level: (bn.props?.level as 2 | 3) ?? 2,
          anchor: String(bn.props?.anchor ?? ""),
          content: inlineToSpans(bn.content),
        });
        break;

      case "notice":
        out.push({
          id: bn.id,
          type: "notice",
          variant: (bn.props?.variant as "info" | "warning") ?? "info",
          content: inlineToSpans(bn.content),
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

  return out;
}
