/**
 * The block document format.
 * --------------------------------------------------------------
 * Envelope fields are columns on `content_pages`; only `body` is JSONB.
 * `PageDocument` is therefore the row, with a typed `body`.
 *
 * Every block carries a stable `id`, generated once on creation and never
 * reassigned — future diffing, commenting and per-block approval anchor to
 * it, and retrofitting ids breaks everything anchored to them.
 */

export type SchemaName =
  | "answer"
  | "guide"
  | "transaction"
  | "finder"
  | "calendar";

export const SCHEMA_NAMES: ReadonlyArray<SchemaName> = [
  "answer",
  "guide",
  "transaction",
  "finder",
  "calendar",
];

export interface PageDocument {
  version: 1;
  id: string;
  url: string;
  slug: string;
  schema_name: SchemaName;
  document_type: string;
  title: string;
  description: string | null;
  is_draft: boolean;
  body: Body;
  updated_at: string;
}

export interface Body {
  version: 1;
  blocks: Block[];
  refs: Record<string, Ref>;
}

export type Mark = "strong" | "em" | "code";

/**
 * A run of text, or — with `ref` and no `text` — a value reference resolved
 * at render time. The three seeded pages do not exercise the reference form;
 * it is in the type so the renderer and the validator handle it and the
 * shape is fixed before references actually arrive.
 */
export interface Span {
  text?: string;
  marks?: Mark[];
  ref?: string;
  field?: string;
}

export type Ref =
  | { kind: "record"; collection: string; record: string }
  | {
      kind: "query";
      collection: string;
      where?: Array<[string, string, unknown]>;
      order_by?: { field: string; direction: "asc" | "desc" };
      limit?: number;
    }
  | { kind: "page"; url: string }
  | { kind: "external"; href: string };

/* ---------------------------------------------------------------- blocks */

export interface ParagraphBlock {
  id: string;
  type: "paragraph";
  content: Span[];
}

export interface HeadingBlock {
  id: string;
  type: "heading";
  /** h1 is the page title, which is an envelope column, not a block. */
  level: 2 | 3;
  /** A URL fragment: generated from the text once, then edited by hand. */
  anchor: string;
  content: Span[];
}

export interface ListItem {
  id: string;
  content: Span[];
}

export interface ListBlock {
  id: string;
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

export interface NoticeBlock {
  id: string;
  type: "notice";
  variant: "info" | "warning";
  content: Span[];
}

export interface StartLinkBlock {
  id: string;
  type: "start_link";
  label: string;
  target_kind: "form" | "page" | "external";
  target: string;
}

/* -------------------------------------------------- configuration blocks */

export interface FacetValue {
  value: string;
  label: string;
  default?: boolean;
}

export interface Facet {
  key: string;
  name: string;
  type: "checkbox" | "radio";
  /**
   * Names the field(s) a computed facet is derived from, for validation
   * rule 6. The brief specifies a single field name; the pharmacy finder
   * needed a list, because `slip` and `subsidisedOnly` are predicates over
   * `type` AND `pppStatus`. See findings §3 — this is a real result.
   */
  computed_from?: string | string[];
  /** `field:value` shorthand for a one-field predicate facet. */
  filter_value?: string;
  allowed_values?: FacetValue[];
  /** Draw the options from a collection's records instead of listing them. */
  allowed_values_from?: string;
  combine_mode?: "and" | "or";
  /** Render as a scrollable group rather than an inline list. */
  large?: boolean;
}

export interface SortOption {
  key: string;
  name: string;
  default?: boolean;
  requires?: "geolocation";
}

export interface ResultTemplate {
  title: string;
  metadata: string[];
  detail_url: string;
}

export interface FinderSearch {
  enabled: boolean;
  label: string;
  fields: string[];
}

export interface FinderBlock {
  id: string;
  type: "finder";
  collection: string;
  document_noun: string;
  results_per_page: number;
  empty_message: string;
  search: FinderSearch;
  facets: Facet[];
  sort: SortOption[];
  result_template: ResultTemplate;
}

export type DateFormat = "long_date" | "short_date";

export interface CalendarColumn {
  field: string;
  label: string;
  format?: DateFormat;
}

export interface CalendarBlock {
  id: string;
  type: "calendar";
  collection: string;
  year_range: { min: number; max: number };
  /**
   * The policy name. The per-holiday substitution trigger is data on the
   * rule row, because Cap. 352 has three distinct rules — see findings §2.
   */
  substitution_rule: "none" | "next-working-day" | "cap-352";
  show_past: boolean;
  columns: CalendarColumn[];
}

export interface DataTableColumn {
  field: string;
  label: string;
}

export interface DataTableBlock {
  id: string;
  type: "data_table";
  /** A key into `body.refs`, which must hold a `query` or `record` ref. */
  source: string;
  columns: DataTableColumn[];
  empty_message: string;
}

/**
 * Contact details for one organisation, read from a collection.
 *
 * The tenth block type, and the first added after the palette was declared
 * closed. It exists because "Get help" sections were being written by hand on
 * every page that needed one: the Drug Service's phone number appeared as
 * prose on the pharmacy page, the NIS department's on the severance page, and
 * changing either meant finding every page that repeated it.
 *
 * The title and the description are the author's, because they are about
 * *this* page — when to get in touch, and what about. The details are not:
 * they belong to the ministry and are the same wherever they appear, so they
 * come from the collection and cannot drift page to page.
 */
export interface ContactBlock {
  id: string;
  type: "contact";
  title: string;
  description: Span[];
  /** A key into `body.refs`, which must hold a `record` ref. */
  source: string;
  /** Which details to show, and what to call them on this page. */
  fields: ContactField[];
}

export interface ContactField {
  field: string;
  label: string;
}

export interface ImagePlaceholderBlock {
  id: string;
  type: "image_placeholder";
  alt: string;
  caption: string;
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | NoticeBlock
  | StartLinkBlock
  | FinderBlock
  | CalendarBlock
  | DataTableBlock
  | ContactBlock
  | ImagePlaceholderBlock;

export type BlockType = Block["type"];

/**
 * The palette. A block type not on this list cannot be inserted.
 *
 * It was nine, and the brief called it closed. `contact` is the tenth, added
 * because repeating a ministry's phone number as prose on every page that
 * needs it is exactly the duplication a block model is for. The findings
 * predicted this would happen during migration rather than before it; what
 * matters is that adding one is a deliberate act with a validation rule
 * attached, not that the number never changes.
 */
export const BLOCK_TYPES: ReadonlyArray<BlockType> = [
  "paragraph",
  "heading",
  "list",
  "notice",
  "start_link",
  "finder",
  "calendar",
  "data_table",
  "contact",
  "image_placeholder",
];

/* ------------------------------------------------- collection definitions */

export interface CollectionField {
  key: string;
  label: string;
  type: string;
}

export interface CollectionDefinition {
  key: string;
  title: string;
  record_key: string;
  schema: { fields: CollectionField[] };
}
