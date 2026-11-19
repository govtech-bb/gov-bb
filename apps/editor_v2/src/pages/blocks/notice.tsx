import { Info } from "@phosphor-icons/react";
import { $createParagraphNode } from "lexical";
import { pageInsertAction } from "../insertion";
import { defineBlock, directive } from "./define-block";
import { PageComponentNode } from "./node";
import "./notice.css";

declare module "./node" {
  interface PageComponentKinds {
    notice: true;
  }
}

/** `:::notice`: information readers need to know, set apart from the text. */
export const notice = defineBlock({
  key: "page-notice",
  kinds: [{ kind: "notice", name: "Notice", traits: ["holds-lines", "leavable"] }],
  markdown: [directive("notice")],
  insert: [
    pageInsertAction(
      "page-notice",
      "Notice",
      () => new PageComponentNode("notice").append($createParagraphNode()),
      {
        group: "Components",
        order: 40,
        icon: <Info />,
        description: "Highlight information readers need to know.",
        aliases: ["callout", "inset text", "important", "note"],
      },
    ),
  ],
});
