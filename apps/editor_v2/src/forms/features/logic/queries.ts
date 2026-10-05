import { calculatedFields, fieldKey } from "../../core/logic";
import { type LexicalNode, type NodeKey } from "lexical";
import {
  $typedPageTitle,
  $isPageHead,
  $blockGroup,
  $blockId,
  $blockKind,
  $formBlocks,
  $isInput,
  $isListLine,
  $isOptionNode,
  $isPageBreak,
  $isQuestionNode,
  $prevBlock,
  $questionKey,
  $settings,
  InputNode,
  LongAnswerNode,
} from "../../editor/nodes";
import { $installedField } from "../../editor/field-context";
import type { FieldCapabilities } from "../../core/fields";
import { $installedContents } from "../../editor/field-context";

export type Field = {
  key: string;
  type: "INPUT_FIELD" | "CALCULATED_FIELD" | "METADATA";
  /** A question's kind ($blockKind), NUMBER or TEXT for a calculated field, the key for metadata. */
  kind: string;
  title: string;
  /** For the value pickers: a choice question's options, as [value, label]. */
  options?: [string, string][];
  multiple?: boolean;
  /** Its page, "Page 2" or "Name #2", for the pickers' page groups. */
  page?: string;
  /** Captured inside the configured editor read for use by React menus later. */
  capabilities?: Pick<FieldCapabilities, "comparisons" | "formula">;
};

export const kindTitle = (kind: string) => {
  const field = $installedField(kind);

  return field
    ? field.label
    : ($installedContents().find(
        (content) =>
          content.kind === kind ||
          content.source.storage.value === kind ||
          content.source.storage.type === kind,
      )?.label ?? kind);
};

export const untitled = (kind: string) => {
  const field = $installedField(kind);

  return field ? field.untitled : `Unlabelled ${kindTitle(kind).toLowerCase()}`;
};

export const stops = new Set(["page-break", "calculated-fields"]);

/** A question uses its visible label, falling back to an internal alias or select prompt. */
export function $questionTitle(first: LexicalNode) {
  let title: string | null = null;

  for (let prev = $prevBlock(first); prev && title === null; prev = $prevBlock(prev)) {
    if ($isQuestionNode(prev)) title = prev.getTextContent();
    else if ($isInput(prev) || stops.has($blockKind(prev))) break;
  }

  const s = $settings(first);
  const kind = $blockKind(first);

  if (title?.trim()) return title.trim();

  if (typeof s.name === "string" && s.name.trim()) return s.name.trim();

  if (title === null || !title.trim()) {
    const placeholder = kind === "dropdown" ? s.placeholder : "";
    title = typeof placeholder === "string" ? placeholder : "";
  }

  return title.trim() || untitled(kind);
}

/** Fields in form order. `before` limits references to earlier blocks; `raw` preserves blank option labels. */
export function $fields({
  before,
  raw,
}: { before?: LexicalNode | null; raw?: boolean } = {}): Field[] {
  const fields: Field[] = [];
  let above = true;
  let pages = 1;
  let page = $pageLabel(1, $formBlocks()[0]);

  for (const block of $formBlocks()) {
    if (before && block.is(before)) above = false;
    const kind = $blockKind(block);
    const id = $blockId(block);
    const s = $settings(block);

    if ($isPageBreak(block)) page = $pageLabel(++pages, block);

    if (!above) continue;

    if (kind === "calculated-fields") {
      for (const f of calculatedFields(s))
        if (f.name && f.type)
          fields.push({
            key: fieldKey(id, f.id),
            type: "CALCULATED_FIELD",
            kind: f.type,
            title: f.name,
            page,
          });
    } else if ($isInput(block) && $blockGroup(block).find($isInput)?.is(block)) {
      const title = $questionTitle(block);
      const field = $installedField(kind);
      const multiple = field?.choice?.multiple ?? field?.capabilities.multiple ?? false;

      const options: [string, string][] = field?.options
        ? field
            .options(s)
            .map((option, index): [string, string] => [
              option.id,
              raw ? option.label : option.label || `Option ${index + 1}`,
            ])
        : $blockGroup(block)
            .filter($isOptionNode)
            .map((o, i): [string, string] => [
              $blockId(o),
              raw ? o.getTextContent() : o.getTextContent() || `Option ${i + 1}`,
            ]);

      const capabilities = field
        ? { comparisons: field.capabilities.comparisons, formula: field.capabilities.formula }
        : undefined;

      const entry: Field = {
        key: $questionKey(block),
        type: "INPUT_FIELD",
        kind,
        title,
        options: options.length ? options : undefined,
        multiple,
        page,
      };

      if (capabilities) entry.capabilities = capabilities;
      fields.push(entry);
    }
  }

  return fields;
}

/** Submission metadata is available after submission, on the confirmation page. */
export const metadataFields: Field[] = [
  ["id", "Submission ID"],
  ["respondentId", "Respondent ID"],
  ["formName", "Form name"],
].map(([key, title]) => ({ key: key!, type: "METADATA", kind: key!, title: title! }));

// ---- Pages, and the blocks Show/Hide can pick ----

export type Page = { id: string; label: string; confirmation: boolean };

export const $pageLabel = (n: number, start: LexicalNode | undefined) => {
  const title = start ? $typedPageTitle(start) : "";

  return `Page ${n}${title ? ` · ${title}` : ""}`;
};

export function $pages() {
  const pages: (Page & { blocks: LexicalNode[] })[] = [
    { id: "start", label: $pageLabel(1, $formBlocks()[0]), confirmation: false, blocks: [] },
  ];

  for (const block of $formBlocks().slice(1)) {
    if ($isPageHead(block)) continue;

    if (!$isPageBreak(block)) {
      pages.at(-1)!.blocks.push(block);
      continue;
    }

    const { confirmation } = $settings(block);
    const label = $pageLabel(pages.length + 1, block);
    pages.push({
      id: $blockId(block),
      label: confirmation ? `${label} (Confirmation page)` : label,
      confirmation: !!confirmation,
      blocks: [],
    });
  }

  return pages;
}

/** A visibility target and the page, question or individual blocks it covers. */
export type TreeNode = {
  key: string;
  /** What Show/Hide keeps: a page's id, a question's key, or a block's id. */
  id: string;
  kind: "page" | "question" | "block";
  label: string;
  /** A block kind for its icon, or a page's: "form-title", "page-break" or "confirmation". */
  icon?: string;
  /** Its page's row, and a block's question row. */
  page: string;
  question?: string;
  /** Block ids: picking a row picks them all. */
  blocks: string[];
  /** A page's position: Page 1 can't be picked. */
  index?: number;
};

export const unhideable = new Set(["conditional-logic", "calculated-fields"]);

/** Options and empty text lines stay unnamed in the visibility tree. */
export function $treeLabel(block: LexicalNode) {
  const kind = $blockKind(block);
  const s = $settings(block);

  // Drawn inputs have no text label, including stray text in an old draft
  const text =
    block instanceof InputNode || block instanceof LongAnswerNode ? "" : block.getTextContent();

  if (kind === "paragraph" && !text.trim()) return "";

  if (text) return text;

  if (typeof s.name === "string" && s.name.trim()) return s.name;

  return $isOptionNode(block)
    ? ""
    : $isListLine(block) && kind === "number"
      ? "Numbered list"
      : kindTitle(kind);
}

/**
 * Pages contain their questions and standalone blocks, in form order.
 * A question and its first answer block share a key; fieldKey(key, key) distinguishes that answer in the tree.
 */
export function $blockTree(): TreeNode[] {
  const nodes: TreeNode[] = [];
  $pages().forEach(({ id, label, confirmation, blocks }, index) => {
    const page: TreeNode = {
      key: `p:${id}`,
      id,
      kind: "page",
      label,
      icon: index === 0 ? "form-title" : confirmation ? "confirmation" : "page-break",
      page: `p:${id}`,
      blocks: [],
      index,
    };

    nodes.push(page);
    const done = new Set<NodeKey>();

    for (const block of blocks) {
      if (done.has(block.getKey())) continue;
      const group = $blockGroup(block);

      for (const node of group) done.add(node.getKey());
      const first = group.find($isInput);

      if (!first) {
        if (unhideable.has($blockKind(block))) continue;
        const bid = $blockId(block);
        page.blocks.push(bid);
        nodes.push({
          key: `b:${bid}`,
          id: bid,
          kind: "block",
          label: $treeLabel(block),
          icon:
            $isListLine(block) && $blockKind(block) === "number"
              ? "numbered-list"
              : $blockKind(block),
          page: page.key,
          blocks: [bid],
        });
        continue;
      }

      const key = $questionKey(first);
      const rows: TreeNode[] = [];

      const add = (id: string, label: string, icon: string) =>
        rows.push({
          key: `b:${id}`,
          id,
          kind: "block",
          label,
          icon,
          page: page.key,
          question: `q:${key}`,
          blocks: [id],
        });

      for (const block of group)
        add(
          $blockId(block) === key ? fieldKey(key, key) : $blockId(block),
          $treeLabel(block),
          $blockKind(block),
        );
      // Use the same visible question name in conditions and Show/Hide targets.
      const name = $settings(group.at(-1)!).name;
      const title = group.find($isQuestionNode)?.getTextContent().trim();

      const label =
        title ||
        (typeof name === "string" && name.trim()) ||
        rows[0]?.label ||
        rows.at(-1)?.label ||
        kindTitle($blockKind(first));

      const ids = rows.map((r) => r.id);
      nodes.push(
        {
          key: `q:${key}`,
          id: key,
          kind: "question",
          label,
          icon: $blockKind(first),
          page: page.key,
          blocks: ids,
        },
        ...rows,
      );
      page.blocks.push(...ids);
    }
  });

  return nodes;
}
