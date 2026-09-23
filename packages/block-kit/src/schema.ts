/**
 * Zod mirror of `Body`, run on every read from the database and every write
 * to it. The `content_pages_body_shape` CHECK only proves the three
 * top-level keys exist; everything below that is application-level.
 */

import { z } from "zod";
import { isSafeHref } from "./href";
import { BLOCK_TYPES, SCHEMA_NAMES } from "./types";

const markSchema = z.enum(["strong", "em", "code"]);

export const spanSchema = z
  .object({
    text: z.string().optional(),
    marks: z.array(markSchema).optional(),
    ref: z.string().optional(),
    field: z.string().optional(),
  })
  .refine((s) => s.text !== undefined || s.ref !== undefined, {
    message: "a span needs either text or a ref",
  });

const contentSchema = z.array(spanSchema);

export const refSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("record"),
    collection: z.string().min(1),
    record: z.string().min(1),
  }),
  z.object({
    kind: z.literal("query"),
    collection: z.string().min(1),
    where: z.array(z.tuple([z.string(), z.string(), z.unknown()])).optional(),
    order_by: z
      .object({ field: z.string(), direction: z.enum(["asc", "desc"]) })
      .optional(),
    limit: z.number().int().positive().optional(),
  }),
  // Refused here as well as at render time. A `javascript:` href that never
  // reaches the database cannot be rendered by an older client, an export,
  // or anything else downstream that forgets to check.
  z.object({
    kind: z.literal("page"),
    url: z
      .string()
      .startsWith("/")
      .refine(isSafeHref, { message: "unsafe url" }),
  }),
  z.object({
    kind: z.literal("external"),
    href: z
      .string()
      .min(1)
      .refine(isSafeHref, { message: "unsafe href scheme" }),
  }),
]);

const blockId = z.string().min(1);

const paragraphSchema = z.object({
  id: blockId,
  type: z.literal("paragraph"),
  content: contentSchema,
});

const headingSchema = z.object({
  id: blockId,
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3)]),
  anchor: z.string().min(1),
  content: contentSchema,
});

const listSchema = z.object({
  id: blockId,
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(z.object({ id: blockId, content: contentSchema })),
});

const noticeSchema = z.object({
  id: blockId,
  type: z.literal("notice"),
  variant: z.enum(["info", "warning"]),
  content: contentSchema,
});

const startLinkSchema = z
  .object({
    id: blockId,
    type: z.literal("start_link"),
    label: z.string().min(1),
    target_kind: z.enum(["form", "page", "external"]),
    // A form target is an id the host resolves, not a url, so only the two
    // kinds that become an href directly are scheme-checked.
    target: z.string().min(1),
  })
  .refine((block) => block.target_kind === "form" || isSafeHref(block.target), {
    message: "start_link target is not a safe url",
    path: ["target"],
  });

export const facetSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["checkbox", "radio"]),
  computed_from: z.union([z.string(), z.array(z.string())]).optional(),
  filter_value: z.string().optional(),
  allowed_values: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
        default: z.boolean().optional(),
      }),
    )
    .optional(),
  allowed_values_from: z.string().optional(),
  combine_mode: z.enum(["and", "or"]).optional(),
  large: z.boolean().optional(),
});

const finderSchema = z.object({
  id: blockId,
  type: z.literal("finder"),
  collection: z.string().min(1),
  document_noun: z.string().min(1),
  results_per_page: z.number().int().positive().max(200),
  empty_message: z.string().min(1),
  search: z.object({
    enabled: z.boolean(),
    label: z.string(),
    fields: z.array(z.string()),
  }),
  facets: z.array(facetSchema),
  sort: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      default: z.boolean().optional(),
      requires: z.literal("geolocation").optional(),
    }),
  ),
  result_template: z.object({
    title: z.string().min(1),
    metadata: z.array(z.string()),
    detail_url: z.string().min(1),
  }),
});

const calendarSchema = z.object({
  id: blockId,
  type: z.literal("calendar"),
  collection: z.string().min(1),
  year_range: z.object({ min: z.number().int(), max: z.number().int() }),
  substitution_rule: z.enum(["none", "next-working-day", "cap-352"]),
  show_past: z.boolean(),
  columns: z.array(
    z.object({
      field: z.string().min(1),
      label: z.string().min(1),
      format: z.enum(["long_date", "short_date"]).optional(),
    }),
  ),
});

const dataTableSchema = z.object({
  id: blockId,
  type: z.literal("data_table"),
  source: z.string().min(1),
  columns: z.array(
    z.object({ field: z.string().min(1), label: z.string().min(1) }),
  ),
  empty_message: z.string().min(1),
});

const contactSchema = z.object({
  id: blockId,
  type: z.literal("contact"),
  title: z.string().min(1),
  description: z.array(spanSchema),
  source: z.string().min(1),
  fields: z.array(
    z.object({ field: z.string().min(1), label: z.string().min(1) }),
  ),
});

const imagePlaceholderSchema = z.object({
  id: blockId,
  type: z.literal("image_placeholder"),
  alt: z.string(),
  caption: z.string(),
});

export const blockSchema = z.discriminatedUnion("type", [
  paragraphSchema,
  headingSchema,
  listSchema,
  noticeSchema,
  startLinkSchema,
  finderSchema,
  calendarSchema,
  dataTableSchema,
  contactSchema,
  imagePlaceholderSchema,
]);

export const bodySchema = z.object({
  version: z.literal(1),
  blocks: z.array(blockSchema),
  refs: z.record(z.string(), refSchema),
});

export const pageDocumentSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  url: z.string().startsWith("/"),
  slug: z.string().min(1),
  schema_name: z.enum(SCHEMA_NAMES as [string, ...string[]]),
  document_type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  is_draft: z.boolean(),
  body: bodySchema,
  updated_at: z.string(),
});

/** Guards the insert menu: nothing outside the closed palette gets in. */
export function isKnownBlockType(value: string): boolean {
  return (BLOCK_TYPES as ReadonlyArray<string>).includes(value);
}
