import { CaretCircleDown } from "@phosphor-icons/react";
import { $createParagraphNode } from "lexical";
import { pageInsertAction } from "../insertion";
import { LabelSettings } from "./block-options";
import { defineBlock, directive } from "./define-block";
import { PageComponentNode } from "./node";
import "./details.css";

declare module "./node" {
  interface PageComponentKinds {
    details: true;
  }

  interface PageComponentAttributes {
    /** What a Details says before it's expanded. */
    summary?: string;
  }
}

/** `:::details[Summary]`: supporting information readers can expand. */
export const details = defineBlock({
  key: "page-details",
  kinds: [
    {
      kind: "details",
      name: "Details",
      traits: ["holds-lines"],
      decorate: (element, { summary }) => {
        if (summary !== undefined) element.dataset.summary = summary;
      },
    },
  ],
  markdown: [
    directive("details", {
      attributes: ({ summary }) => ({ summary }),
      label: ({ summary }) => summary,
    }),
  ],
  insert: [
    pageInsertAction(
      "page-details",
      "Details",
      () =>
        new PageComponentNode("details", { summary: "More information" }).append(
          $createParagraphNode(),
        ),
      {
        group: "Components",
        order: 40,
        icon: <CaretCircleDown />,
        description: "Let readers expand supporting information.",
        aliases: ["disclosure", "expand", "show and hide", "more information"],
        notInside: ["details"],
      },
    ),
  ],
  options: [
    {
      kinds: ["details"],
      Options: (props) => <LabelSettings {...props} name="Details summary" attribute="summary" />,
    },
  ],
});
