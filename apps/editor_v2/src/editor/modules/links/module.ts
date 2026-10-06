import { LinkExtension, LinkNode } from "@lexical/link";
import type { EditorModule } from "../../core/module";

export const linkTheme =
  "cursor-pointer text-interactive underline decoration-1 underline-offset-[0.15em] hover:bg-interactive-subtle hover:text-ink";

export function LinksModule(): EditorModule {
  return {
    key: "links",
    requires: ["text"],
    provides: ["links"],
    nodes: [{ type: "link", node: LinkNode }],
    browserExtensions: [LinkExtension],
    theme: { link: linkTheme },
  };
}
