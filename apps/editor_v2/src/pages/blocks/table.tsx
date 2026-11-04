import { LabelSettings } from "./block-options";
import { defineBlock, directive } from "./define-block";

declare module "./node" {
  interface PageComponentKinds {
    table: true;
  }
}

/**
 * `:::table[Caption]` around a Markdown table: its caption and how its rows and columns read. The table inside is the
 * tables module's.
 */
export const captionedTable = defineBlock({
  key: "page-captioned-table",
  kinds: [
    {
      kind: "table",
      decorate: (element, { caption }) => {
        if (caption !== undefined) element.dataset.summary = caption;
      },
    },
  ],
  markdown: [
    directive("table", {
      attributes: ({ caption, rowHeaders, numericColumns }) => ({
        caption,
        rowHeaders,
        numericColumns,
      }),
      children: ({ table }) => [table],
      label: ({ caption }) => caption,
      directiveAttributes: ({ rowHeaders, numericColumns }) => ({
        "row-headers": rowHeaders === "first" ? "first" : undefined,
        "numeric-columns": numericColumns?.length
          ? numericColumns.map((index) => index + 1).join(",")
          : undefined,
      }),
    }),
  ],
  options: [
    {
      kinds: ["table"],
      Options: (props) => <LabelSettings {...props} name="Table caption" attribute="caption" />,
    },
  ],
});
