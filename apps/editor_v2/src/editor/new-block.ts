import { BLOCK_TYPES, type Block, type BlockType } from "@govtech-bb/block-kit";

/**
 * Ids are generated once here and never reassigned. Future diffing,
 * commenting and per-block approval anchor to them.
 */
export function newId(prefix = "b"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  list: "List",
  notice: "Notice",
  start_link: "Start button",
  finder: "Finder",
  calendar: "Calendar",
  data_table: "Data table",
  image_placeholder: "Image",
};

/**
 * The closed palette, made visible. There is no "insert HTML", no raw-JSON
 * escape hatch and no code block: if an author wants something not on this
 * list, the answer is a new block type shipped by a developer.
 */
export const INSERTABLE: ReadonlyArray<BlockType> = BLOCK_TYPES;

export function createBlock(type: BlockType): Block {
  const id = newId();
  switch (type) {
    case "paragraph":
      return { id, type, content: [{ text: "" }] };
    case "heading":
      return { id, type, level: 2, anchor: "", content: [{ text: "" }] };
    case "list":
      return {
        id,
        type,
        ordered: false,
        items: [{ id: newId("li"), content: [{ text: "" }] }],
      };
    case "notice":
      return { id, type, variant: "info", content: [{ text: "" }] };
    case "start_link":
      return { id, type, label: "Start now", target_kind: "page", target: "/" };
    case "image_placeholder":
      return { id, type, alt: "", caption: "" };
    case "data_table":
      return {
        id,
        type,
        source: "",
        columns: [],
        empty_message: "Nothing to show.",
      };
    case "calendar":
      return {
        id,
        type,
        collection: "",
        year_range: { min: 2020, max: 2050 },
        substitution_rule: "cap-352",
        show_past: true,
        columns: [{ field: "date", label: "Date", format: "long_date" }],
      };
    case "finder":
      return {
        id,
        type,
        collection: "",
        document_noun: "result",
        results_per_page: 20,
        empty_message: "Nothing matches your filters.",
        search: { enabled: false, label: "Search", fields: [] },
        facets: [],
        sort: [],
        result_template: { title: "name", metadata: [], detail_url: "/" },
      };
  }
}
