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

/** 301 body for a bare slug; `redirect` is the site path WITH a leading slash
 *  (same value as the `Location` header). Fetch with `redirect: 'manual'`. */
export type RedirectBody = { redirect: string };

/** 400 / 404 body. */
export type ErrorBody = { error: string };

/** Custom elements and attributes the API allows IN ADDITION to
 *  `rehype-sanitize`'s default schema: the API extends the sanitizer with
 *  exactly this list, and landing's component map renders exactly these tags.
 *  Plugins that run after sanitizing add more on standard elements — headings
 *  carry an `id`, and their anchor `a` carries `ariaHidden: true`,
 *  `className: ['anchor-heading']` and `tabIndex: -1` — so a renderer must
 *  forward those too, not only the properties listed here. */
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
