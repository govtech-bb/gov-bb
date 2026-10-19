import type { EditorModule } from "../../editor/core/module";
import type { ContentEntry } from "../../editor/modules/formatting/insertion";
import type { ResolvedContent } from "../content";
import type { FormModule } from "../field";
import { formInsertionAction } from "./insertion-action";

/** Generic content keeps its storage; forms supply contextual placement and dialect/output adapters. */
export function formContentModule(
  module: EditorModule,
  contents: readonly ResolvedContent[],
  entries: readonly ContentEntry[],
  order: number,
): FormModule {
  return {
    ...module,
    contents: contents.map((content) =>
      Object.freeze({
        ...content,
        icon: content.icon ?? entries.find((entry) => entry.kind === content.kind)?.icon,
      }),
    ),
    actions: entries.map((entry, index) =>
      formInsertionAction(
        entry,
        "Layout blocks",
        order + index,
        entry.renderPreview?.(entry.sample ?? {}),
      ),
    ),
  };
}
