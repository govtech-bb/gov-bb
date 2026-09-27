import type { Root } from "hast";

export type Frontmatter = {
  title: string;
  description?: string;
  lede?: string;
  categories: string[];
  subcategory?: string;
  publish_date?: string; // ISO; a Date in v1, a string on the wire
  source_url?: string;
  stage?: "alpha";
  visibility: "public" | "preview" | "draft";
  featured?: boolean;
  section?: string;
  service_type?: "digital" | "information";
  form_id?: string;
  keywords?: string[];
};

export type PageResponse = {
  url: string; // site path, no leading slash (v1 ContentPage.url)
  frontmatter: Frontmatter;
  hast: Root; // position data stripped
  breadcrumbs: { name: string; url: string }[];
};

/** Elements the compiler may emit beyond plain prose, with the hast property
 *  names each may carry. Sanitizer allowlist (API) and component map (landing). */
export const CONTENT_ELEMENTS = {
  a: ["href", "dataStartLink", "dataFormId"],
  table: [],
  th: ["scope"],
  td: [],
  notice: [],
  highlights: [],
  contacts: [],
  contact: ["label", "number", "tel", "emergency"],
  muted: ["caption"],
  "show-hide": ["summary"],
  buttons: [],
  "link-button": ["href", "variant"],
} as const satisfies Record<string, readonly string[]>;
