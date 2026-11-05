import {
  parseLegacyPageStartLink,
  serializeLegacyPageStartLink,
} from "@govtech-bb/govbbmarkd/legacy";
import { UnsupportedPageContent } from "../markdown";
import { safePageUrl } from "../modules/text";
import { decorateButton } from "./actions";
import { defineBlock } from "./define-block";
import { PageComponentNode } from "./node";
import "./buttons.css";

declare module "./node" {
  interface PageComponentKinds {
    start: true;
  }

  /** Without an href, a Start marker goes to the page's linked form. */
  interface PageComponentAttributes {
    href?: string;
  }
}

/**
 * An existing `<a data-start-link>` marker, kept as it was written: retained only for existing serialized editor states
 * and HTML markers. New Start buttons are actions taking readers to the linked form (see ./actions).
 */
export const startLink = defineBlock({
  key: "page-start-link",
  kinds: [{ kind: "start", shadowRoot: false, traits: ["button"], decorate: decorateButton }],
  markdown: [
    {
      accepts: (node) => !!parseLegacyPageStartLink(node),
      owns: (node) => node instanceof PageComponentNode && node.getKind() === "start",
      $import(node, context) {
        const start = parseLegacyPageStartLink(node);

        if (!start) throw new UnsupportedPageContent(node);

        if (start.href !== undefined && !safePageUrl(start.href))
          throw new UnsupportedPageContent(node, "This link destination needs source editing");

        return [
          new PageComponentNode(
            "start",
            start.href === undefined ? {} : { href: start.href },
          ).append(...start.label.flatMap((child) => context.$import(child))),
        ];
      },
      $export(node, context) {
        if (!(node instanceof PageComponentNode)) throw new Error("Expected a Start button");

        return [
          {
            type: "html",
            value: serializeLegacyPageStartLink(
              node.getChildren().flatMap((child) => context.$export(child)),
              node.getAttributes().href,
            ),
          },
        ];
      },
    },
  ],
});
