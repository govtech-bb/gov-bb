import {
  $createParagraphNode,
  $findMatchingParent,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  ParagraphNode,
  type EditorConfig,
  type NodeKey,
  type RangeSelection,
  type SerializedParagraphNode,
} from "lexical";
import type { Paragraph } from "mdast";
import { SELECTION_TOOLBAR, TextColourMenu, type TextColours } from "@/editor/modules";
import { defineSlot } from "@/editor/react";
import type { PageHandler, PageModule } from "../definition";
import { phrasing, UnsupportedPageContent } from "../markdown";
import "./muted.css";

type SerializedPageMuted = SerializedParagraphNode & { caption: boolean };

/**
 * @deprecated Muted text is retained, not supported. Landing's `<muted>` only turns a paragraph grey, and small with
 * `caption`: presentation with no meaning of its own, which new content shouldn't use. It stays only so the pages that
 * already have it remain editable, so nothing inserts it; the selection toolbar offers it as a colour, which can also
 * take it off. Remove this module once no page has `<muted>`.
 */
export class PageMutedNode extends ParagraphNode {
  __caption: boolean;
  static override getType() {
    return "page-muted";
  }
  static override clone(node: PageMutedNode) {
    return new PageMutedNode(node.__caption, node.__key);
  }
  constructor(caption = false, key?: NodeKey) {
    super(key);
    this.__caption = caption;
  }
  static override importJSON(value: SerializedPageMuted) {
    return new PageMutedNode(value.caption).updateFromJSON(value);
  }
  override exportJSON(): SerializedPageMuted {
    return { ...super.exportJSON(), type: "page-muted", version: 1, caption: this.__caption };
  }
  isCaption() {
    return this.getLatest().__caption;
  }
  override createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.dataset.muted = this.__caption ? "caption" : "text";

    return element;
  }
  /** Enter within the text keeps both halves muted; at its end, writing goes on in ordinary text, as after a heading. */
  override insertNewAfter(selection: RangeSelection, restoreSelection = true) {
    const last = this.getLastDescendant();

    if (
      !last ||
      (selection.anchor.key === last.getKey() &&
        selection.anchor.offset === last.getTextContentSize())
    )
      return super.insertNewAfter(selection, restoreSelection);

    const next = new PageMutedNode(this.__caption);
    this.insertAfter(next, restoreSelection);

    return next;
  }
}

// A paragraph in <muted> or <muted caption>, as landing's pages write it
function mutedContent(node: Paragraph) {
  const [first, ...content] = node.children;
  const last = content.pop();
  const open = first?.type === "html" ? /^<muted(\s+caption)?\s*>$/i.exec(first.value) : null;

  if (!open || last?.type !== "html" || !/^<\/muted\s*>$/i.test(last.value)) return;

  return { caption: open[1] !== undefined, content };
}

const muted: PageHandler = {
  accepts: (node) => node.type === "paragraph" && !!mutedContent(node),
  owns: (node) => node instanceof PageMutedNode,
  $import(node, context) {
    const text = node.type === "paragraph" ? mutedContent(node) : undefined;

    if (!text) throw new UnsupportedPageContent(node);

    return [
      new PageMutedNode(text.caption).append(
        ...text.content.flatMap((child) => context.$import(child)),
      ),
    ];
  },
  $export(node, context) {
    if (!(node instanceof PageMutedNode)) throw new Error("Expected muted text");
    const children = phrasing(node.getChildren().flatMap((child) => context.$export(child)));

    // An empty line has nothing to grey out
    if (!children.length) return [{ type: "paragraph", children }];

    return [
      {
        type: "paragraph",
        children: [
          { type: "html", value: node.isCaption() ? "<muted caption>" : "<muted>" },
          ...children,
          { type: "html", value: "</muted>" },
        ],
      },
    ];
  },
};

/**
 * @deprecated Keeps existing muted text editable, and adds the selection toolbar's colour menu, which also takes it off;
 * see PageMutedNode. It comes before the text module, which would read muted text as ordinary paragraphs.
 */
export function PageMutedModule(): PageModule {
  return {
    key: "page-muted",
    requires: ["text"],
    nodes: [{ type: "page-muted", node: PageMutedNode }],
    markdown: [muted],
    slots: [
      defineSlot("page-text-colour", SELECTION_TOOLBAR, () => (
        <TextColourMenu colours={pageTextColours} />
      )),
    ],
  };
}

// The paragraphs a selection touches, when all are directly on the page, the only paragraphs landing's pages mute, or
// are muted text elsewhere, as in a list item or Notice, which can only be taken off
function $selectedParagraphs(): ParagraphNode[] | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection)) return null;
  const lines: ParagraphNode[] = [];

  for (const node of selection.getNodes()) {
    const line =
      $findMatchingParent(node, (parent) => parent instanceof PageMutedNode) ??
      node.getTopLevelElement();

    if (
      !$isParagraphNode(line) ||
      !(line instanceof PageMutedNode || $isRootNode(line.getParent()))
    )
      return null;

    if (!lines.some((known) => known.is(line))) lines.push(line);
  }

  return lines.length ? lines : null;
}

// The colours for a page's text: its own, or the legacy muted grey (see PageMutedNode)
const pageTextColours: TextColours = {
  choices: [
    { value: "default", label: "Default", swatch: "bg-ink" },
    { value: "muted", label: "Muted", swatch: "bg-muted" },
  ],
  $value() {
    const lines = $selectedParagraphs();

    if (!lines) return undefined;
    const muted = lines.filter((line) => line instanceof PageMutedNode).length;

    return muted === lines.length ? "muted" : muted ? null : "default";
  },
  // A muted caption stays one; muting ordinary text never makes a caption
  $colour(value) {
    for (const line of $selectedParagraphs() ?? []) {
      if (value === "muted" && !(line instanceof PageMutedNode))
        line.replace(new PageMutedNode(), true);
      else if (value !== "muted" && line instanceof PageMutedNode)
        line.replace($createParagraphNode(), true);
    }
  },
};
