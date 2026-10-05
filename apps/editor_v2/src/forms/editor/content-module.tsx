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
        <div
          aria-hidden="true"
          className="pointer-events-none mt-5 rounded-sm bg-grey-10 p-4 select-none"
        >
          <div className="overflow-hidden rounded-sm bg-white p-5 text-(length:--form-text) shadow-sheet [--form-control:2.75rem] [--form-marker:1.75rem] [--form-text:1rem]">
            {entry.renderPreview?.(entry.sample ?? {})}
          </div>
        </div>,
      ),
    ),
  };
}
