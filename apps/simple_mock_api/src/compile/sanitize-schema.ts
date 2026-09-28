import { CONTENT_ELEMENTS } from "@govtech-bb/landing-v2-contract";
import { defaultSchema, type Options } from "rehype-sanitize";

const contentTags = Object.keys(CONTENT_ELEMENTS) as Array<
  keyof typeof CONTENT_ELEMENTS
>;

/**
 * rehype-sanitize's GitHub-style default, widened to the content elements the
 * landing renders (with their properties) and to `tel:` links. Every other
 * default is kept on purpose: comments dropped, `<script>` stripped, unknown
 * elements unwrapped, `id`/`name` clobber-prefixed.
 */
export const schema: Options = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...contentTags],
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(
      contentTags.map((tag) => [
        tag,
        [...(defaultSchema.attributes?.[tag] ?? []), ...CONTENT_ELEMENTS[tag]],
      ]),
    ),
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), "tel"],
    tel: ["tel"],
  },
};
