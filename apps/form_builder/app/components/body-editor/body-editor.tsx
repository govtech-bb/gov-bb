import { Banner } from "../ui/banner";
import {
  analyzeMarkdownCompatibility,
  isSafeContentUrl,
} from "@govtech-bb/content/markdown-authoring";
import { CodeExtension } from "@lexical/code";
import {
  ClickAfterLastBlockExtension,
  HorizontalRuleExtension,
  SelectBlockExtension,
  TabIndentationExtension,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { LinkExtension } from "@lexical/link";
import { ListExtension } from "@lexical/list";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { RichTextExtension } from "@lexical/rich-text";
import { TableExtension } from "@lexical/table";
import { configExtension, defineExtension } from "lexical";
import { useId, useMemo, useRef, useState } from "react";
import { LandingComponentNode, RawBreakNode, StartLinkNode } from "./nodes";
import {
  EditorToolbar,
  MarkdownSyncPlugin,
  SlashCommandPlugin,
} from "./plugins";
import type { BodyEditorProps } from "./types";
import { Tabs } from "../ui/tabs";
import { SelectionActions } from "../ui/ai/selection-actions";
import { InputArea } from "../ui/input/input-area";

export type { BodyEditorProfile, BodyEditorProps } from "./types";

const bodyEditorExtension = defineExtension({
  name: "govbb-body-editor",
  namespace: "govbb-body-editor",
  nodes: [LandingComponentNode, RawBreakNode, StartLinkNode],
  dependencies: [
    RichTextExtension,
    HistoryExtension,
    ListExtension,
    configExtension(LinkExtension, { validateUrl: isSafeContentUrl }),
    configExtension(TableExtension, {
      hasCellMerge: false,
      hasHorizontalScroll: true,
      hasNestedTables: false,
      hasTabHandler: true,
    }),
    CodeExtension,
    HorizontalRuleExtension,
    TabIndentationExtension,
    ClickAfterLastBlockExtension,
    SelectBlockExtension,
  ],
  theme: {
    link: "text-ui-link decoration-1 underline-offset-2",
    quote: "my-2.5 border-s-3 border-ui-line py-0.5 ps-3 text-ui-subtle",
    hr: "my-3.5 border-0 border-t border-ui-line",
    heading: {
      h2: "mt-4.5 mb-2 text-[18px] font-semibold",
      h3: "mt-3.5 mb-1.5 text-[15.5px] font-semibold",
      h4: "mt-3 mb-1.25 text-[14px] font-semibold",
    },
    list: {
      listitem: "my-0.75",
      ol: "my-2 ps-6",
      ul: "my-2 ps-6",
    },
    table: "my-2.5 w-full border-collapse",
    tableCell: "border border-ui-hairline px-2.5 py-1.5 text-[13px]",
    tableCellHeader:
      "border border-ui-hairline bg-ui-elevated px-2.5 py-1.5 text-start text-[13px] font-semibold",
    tableScrollableWrapper: "max-w-full overflow-x-auto",
  },
  onError(error) {
    throw error;
  },
});

export function BodyEditor({
  id,
  ariaLabel,
  value,
  onChange,
  profile,
  onAiAction,
}: BodyEditorProps) {
  const editorHost = useRef<HTMLDivElement>(null);
  const compatibility = useMemo(
    () => analyzeMarkdownCompatibility(value, profile.kind),
    [profile.kind, value],
  );
  const [requestedMode, setRequestedMode] = useState<"visual" | "markdown">(
    () => (compatibility.mode === "visual" ? "visual" : "markdown"),
  );
  const visualAvailable = compatibility.mode === "visual";
  const mode = visualAvailable ? requestedMode : "markdown";
  const instanceId = useId().replaceAll(":", "");
  const visualTabId = `${instanceId}-visual-tab`;
  const markdownTabId = `${instanceId}-markdown-tab`;
  const visualPanelId = `${instanceId}-visual-panel`;
  const markdownPanelId = `${instanceId}-markdown-panel`;

  const reasons =
    compatibility.mode === "source-only"
      ? compatibility.reasons.map((reason) => reason.message)
      : [];

  return (
    <LexicalExtensionComposer
      extension={bodyEditorExtension}
      contentEditable={null}
    >
      <div className="@container flex flex-col" ref={editorHost}>
        <div className="flex flex-wrap items-center gap-2 rounded-t-md border border-ui-hairline border-b-0 bg-ui-elevated p-1.5 @max-[680px]:items-start">
          {mode === "visual" && <EditorToolbar profile={profile} />}
          <Tabs
            className="ms-auto @max-[680px]:-order-1"
            aria-label="Editing mode"
            size="sm"
            activateOnFocus
            tabs={[
              {
                value: "visual",
                label: "Visual",
                disabled: !visualAvailable,
                id: visualTabId,
                "aria-controls": visualPanelId,
              },
              {
                value: "markdown",
                label: "Markdown",
                id: markdownTabId,
                "aria-controls": markdownPanelId,
              },
            ]}
            value={mode}
            onValueChange={(next) =>
              setRequestedMode(next as "visual" | "markdown")
            }
          />
        </div>

        <div
          id={visualPanelId}
          role="tabpanel"
          aria-labelledby={visualTabId}
          hidden={mode !== "visual"}
          className="relative"
        >
          <ContentEditable
            id={`${id}-visual`}
            className="min-h-105 rounded-b-md border border-ui-hairline bg-ui-base px-4 py-3.5 text-base leading-relaxed focus-visible:border-ui-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-default [&_p]:my-2"
            aria-label={ariaLabel}
            aria-placeholder="Write your content…"
            placeholder={
              <span className="pointer-events-none absolute start-4 top-3.5 text-ui-placeholder">
                Write your content…
              </span>
            }
          />
          <SlashCommandPlugin profile={profile} />
        </div>

        <div
          id={markdownPanelId}
          role="tabpanel"
          aria-labelledby={markdownTabId}
          hidden={mode !== "markdown"}
        >
          {reasons.length > 0 && (
            <Banner variant="alert" role="status">
              <div className="min-w-0 space-y-2">
                <strong>Markdown mode is required for this content.</strong>
                <span>{reasons.join(" ")}</span>
              </div>
            </Banner>
          )}
          <InputArea
            id={id}
            className="min-h-72 w-full resize-y rounded-none font-mono ring-0"
            rows={18}
            value={value}
            aria-label={ariaLabel}
            aria-describedby={
              reasons.length > 0 ? `${instanceId}-source-help` : undefined
            }
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              profile.kind === "form-content"
                ? "Write the page in markdown…"
                : "Write the page in Markdown…"
            }
          />
          {reasons.length > 0 && (
            <small
              id={`${instanceId}-source-help`}
              className="mt-1.5 block text-[11.5px] text-ui-default"
            >
              Visual editing will become available when unsupported source is
              removed or converted to a supported component.
            </small>
          )}
        </div>

        {onAiAction && (
          <SelectionActions
            target={editorHost}
            value={value}
            onAction={onAiAction}
          />
        )}
        <MarkdownSyncPlugin
          enabled={visualAvailable}
          value={value}
          onChange={onChange}
        />
      </div>
    </LexicalExtensionComposer>
  );
}
