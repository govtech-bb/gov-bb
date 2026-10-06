import { $getRoot } from "lexical";
import type { FormModule } from "../../field";
import {
  FormTitleNode,
  PageTitleNode,
  PageDescriptionNode,
  $normalizePages,
} from "../../editor/nodes";
import { defineRenderer, defineSlot } from "../../../editor/react/contributions";
import { formInsertionAction } from "../../editor/insertion-action";
import { $normalizePageHeads, registerPageHeads } from "./headings";
import { PageBreak } from "./presentation";
import { PageButtons } from "./buttons";
import { pageEntries, PageInsertionPreview } from "./insertion";
import { validatePageNode } from "../../editor/page-settings";

export function $normalizePageStructure() {
  const root = $getRoot();
  $normalizePages(root);
  $normalizePageHeads(root);
}

export const PagesModule = (): FormModule => ({
  key: "form-pages",
  requires: ["form", "form-repetition"],
  provides: ["form-pages"],
  nativeCapabilities: {
    pageRoles: ["questions", "review", "declaration", "confirmation", "result"],
  },
  nodes: [FormTitleNode, PageTitleNode, PageDescriptionNode].map((node) => ({
    type: node.getType(),
    node,
    validate: node === FormTitleNode ? validatePageNode : undefined,
  })),
  structural: [
    {
      storage: {
        type: "widget",
        property: "widget",
        value: "page-break",
        defaultValue: "page-break",
      },
      containerClassName:
        "[counter-increment:page] data-page-button:mt-[calc(var(--form-gap)_+_0.5rem_+_var(--form-control))]",
    },
  ],
  actions: pageEntries.map((entry, index) =>
    formInsertionAction(
      entry,
      "Layout blocks",
      3000 + index,
      <PageInsertionPreview entry={entry} />,
    ),
  ),
  renderers: [defineRenderer("widget:page-break", PageBreak)],
  slots: [defineSlot("form-page-buttons", "form.canvas-after", PageButtons)],
  registrations: [{ key: "page-headings", phase: "browser", register: registerPageHeads }],
  $normalizeInitial: $normalizePageStructure,
});
