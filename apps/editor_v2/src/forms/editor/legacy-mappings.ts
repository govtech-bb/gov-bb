import type { ContentSsbHandler, ResolvedFieldSsbHandler } from "./legacy-contracts";
import { legacyFieldHandlers } from "./legacy-field-mappings";
import { calculatedFields, conditionalLogic, fieldKey } from "../core/logic";

const text =
  (style: "paragraph" | "title" | "h1" | "h2" | "h3"): ContentSsbHandler =>
  (node, context) => ({
    entry: {
      type: "text",
      id: context.id,
      hidden: context.hidden,
      style,
      markdown: context.markdown,
    },
    covers: [node],
  });

const list =
  (ordered: boolean): ContentSsbHandler =>
  (node, context) => {
    const covers = context.$listRun(node);

    return {
      entry: {
        type: "list",
        id: context.id,
        ordered,
        items: covers.map((line) => ({
          id: context.$id(line),
          markdown: context.$markdown(line),
          hidden: context.$settings(line).hidden === true || undefined,
        })),
      },
      covers,
    };
  };

const callout =
  (variant: "inset" | "warning"): ContentSsbHandler =>
  (node, context) => ({
    entry: {
      type: "callout",
      id: context.id,
      fieldId: context.fieldId!,
      variant,
      markdown: context.markdown,
      hidden: context.hidden,
    },
    covers: [node],
  });

const legacyContentHandlers: Readonly<Record<string, ContentSsbHandler>> = Object.freeze({
  paragraph: text("paragraph"),
  title: text("title"),
  h1: text("h1"),
  h2: text("h2"),
  h3: text("h3"),
  bullet: list(false),
  number: list(true),
  inset: callout("inset"),
  warning: callout("warning"),
  "show-hide": (node, context) => ({
    entry: {
      type: "section",
      id: context.id,
      fieldId: context.fieldId!,
      summary: node.getTextContent().trim(),
      ssb: context.$sectionKind(node),
      hidden: context.hidden,
    },
    covers: [node],
  }),
  logic: (node, context) => ({
    entry: { type: "logic", id: context.id, ...conditionalLogic(context.settings) },
    covers: [node],
  }),
  "calculated-fields": (node, context) => ({
    entry: {
      type: "calculated-fields",
      id: context.id,
      fields: calculatedFields(context.settings).flatMap((field) =>
        field.type
          ? [
              {
                key: fieldKey(context.id, field.id),
                name: field.name ?? "",
                type: field.type,
                value: field.value,
              },
            ]
          : [],
      ),
    },
    covers: [node],
  }),
});

/** An explicit undefined override intentionally disables compatibility for this configured module. */
export function legacyFieldAdapter(
  field: { readonly kind: string; readonly legacySsb?: ResolvedFieldSsbHandler } | undefined,
): ResolvedFieldSsbHandler | undefined {
  if (!field) return undefined;

  return Object.hasOwn(field, "legacySsb") ? field.legacySsb : legacyFieldHandlers[field.kind];
}

export function legacyContentAdapter(
  content: { readonly kind: string; readonly legacySsb?: ContentSsbHandler } | undefined,
): ContentSsbHandler | undefined {
  if (!content) return undefined;

  return Object.hasOwn(content, "legacySsb")
    ? content.legacySsb
    : legacyContentHandlers[content.kind];
}
