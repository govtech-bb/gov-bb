import { ListDashes, Plus } from "@phosphor-icons/react";
import { $createParagraphNode } from "lexical";
import { pageInsertAction } from "../insertion";
import { BlockMenuItem, LabelSettings, type BlockOptionsProps } from "./block-options";
import { defineBlock, directive } from "./define-block";
import { PageComponentNode } from "./node";

declare module "./node" {
  interface PageComponentKinds {
    "summary-list": true;
    "summary-item": true;
  }

  interface PageComponentAttributes {
    /** The fact a summary item names, such as "Fee". */
    summaryKey?: string;
  }
}

function AddSummaryItem({ change }: BlockOptionsProps) {
  return (
    <BlockMenuItem
      icon={<Plus />}
      onClick={() =>
        change((node) => {
          const item = new PageComponentNode("summary-item", {
            summaryKey: "Key",
          }).append($createParagraphNode());

          if (node.getKind() === "summary-list") node.append(item);
          else node.insertAfter(item);
          item.selectStart();
        })
      }
    >
      Add summary item
    </BlockMenuItem>
  );
}

/** `::::summary-list` of `:::summary-item[Key]` rows: named facts and their values. */
export const summaryList = defineBlock({
  key: "page-summary-list",
  kinds: [
    { kind: "summary-list" },
    {
      kind: "summary-item",
      name: "Summary item",
      decorate: (element, { summaryKey }) => {
        if (summaryKey !== undefined) element.dataset.summary = summaryKey;
      },
    },
  ],
  markdown: [
    directive("summary-list"),
    directive("summary-item", {
      attributes: ({ key }) => ({ summaryKey: key }),
      label: ({ summaryKey }) => summaryKey,
    }),
  ],
  insert: [
    pageInsertAction(
      "page-summary-list",
      "Summary list",
      () =>
        new PageComponentNode("summary-list").append(
          new PageComponentNode("summary-item", { summaryKey: "Key" }).append(
            $createParagraphNode(),
          ),
        ),
      {
        group: "Components",
        order: 40,
        icon: <ListDashes />,
        description: "Present named facts and their values.",
        aliases: ["key value", "facts"],
      },
    ),
  ],
  options: [
    {
      kinds: ["summary-item"],
      Options: (props) => <LabelSettings {...props} name="Summary key" attribute="summaryKey" />,
    },
    { kinds: ["summary-list", "summary-item"], Options: AddSummaryItem },
  ],
});
