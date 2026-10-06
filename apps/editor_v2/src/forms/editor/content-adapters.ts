import { $createParagraphNode } from "lexical";
import { $createHeadingNode } from "@lexical/rich-text";
import { $createBulletNode, $createNumberNode } from "../../editor/modules/lists/nodes";
import { $createInsetNode, $createWarningNode } from "../../editor/modules/callouts/nodes";
import { $createShowHideNode } from "../../editor/modules/disclosure/nodes";
import type { ContentDefinition } from "../content";
import { defineContent } from "../content";
import { autoId } from "../core/identities";
import type { ContentSourceHandler } from "../source/content";
import { nativeContent } from "../native";

const text = (
  kind: string,
  label: string,
  source: Omit<ContentSourceHandler, "kind">,
  turnInto: ContentDefinition["turnInto"],
) =>
  defineContent({
    kind,
    label,
    source,
    turnInto,
    native: nativeContent(
      kind,
      source.syntax.type === "heading"
        ? { kind: "heading", config: { level: source.syntax.level } }
        : { kind: "paragraph" },
    ),
  });

export const paragraphContent = text(
  "paragraph",
  "Text",
  { storage: { type: "paragraph" }, syntax: { type: "paragraph" } },
  { kind: "paragraph", order: 0, create: $createParagraphNode },
);

export const headingContents = ([1, 2, 3] as const).map((level) =>
  text(
    `h${level}`,
    `Heading ${level}`,
    {
      storage: { type: "heading", property: "tag", value: `h${level}` },
      syntax: { type: "heading", level },
    },
    { kind: `h${level}`, order: 1 + level, create: () => $createHeadingNode(`h${level}`) },
  ),
);

export const listContents = [false, true].map((ordered) =>
  defineContent({
    kind: ordered ? "number" : "bullet",
    label: ordered ? "Numbered list" : "Bulleted list",
    turnInto: {
      kind: ordered ? "number" : "bullet",
      order: ordered ? 6 : 5,
      create: ordered ? $createNumberNode : $createBulletNode,
    },
    source: { storage: { type: ordered ? "number" : "bullet" }, syntax: { type: "list", ordered } },
    native: nativeContent(ordered ? "number" : "bullet", { kind: "list", config: { ordered } }),
  }),
);

export const calloutContents = (["inset", "warning"] as const).map((kind) =>
  defineContent({
    kind,
    label: kind === "inset" ? "Inset text" : "Warning text",
    turnInto: {
      kind,
      order: kind === "inset" ? 7 : 8,
      create: kind === "inset" ? $createInsetNode : $createWarningNode,
    },
    source: { storage: { type: kind }, syntax: { type: "directive", name: kind } },
    native: nativeContent(kind, { kind: "callout", config: { tone: kind } }),
    fieldId: (text) => {
      const name = kind === "warning" ? "warning" : "note";

      return autoId(`${text.split(/\s+/).slice(0, 4).join(" ")} ${name}`, name, `${name}-`);
    },
  }),
);

export const disclosureContent = defineContent({
  kind: "show-hide",
  label: "Details",
  turnInto: { kind: "show-hide", order: 9, create: $createShowHideNode },
  source: {
    storage: { type: "show-hide" },
    syntax: { type: "directive", name: "show-hide", nested: true },
  },
  native: nativeContent("show-hide", { kind: "expandable" }),
  fieldId: (text) => autoId(text, "show-hide", "show-hide-"),
});
