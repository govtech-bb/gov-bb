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
import { useId, useMemo, useState } from "react";
import {
  LandingComponentNode,
  RawBreakNode,
  StartLinkNode,
} from "./-body-editor-nodes";
import {
  EditorToolbar,
  MarkdownSyncPlugin,
  SlashCommandPlugin,
} from "./-body-editor-plugins";
import type { BodyEditorProps } from "./-body-editor-types";
import { SlidingTabs } from "./-sliding-tabs";
import s from "./-styles.module.css";

export type { BodyEditorProfile, BodyEditorProps } from "./-body-editor-types";

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
    link: s.editorLink,
    quote: s.editorQuote,
    hr: s.editorRule,
    heading: {
      h2: s.editorHeading2,
      h3: s.editorHeading3,
      h4: s.editorHeading4,
    },
    list: {
      listitem: s.editorListItem,
      ol: s.editorOrderedList,
      ul: s.editorUnorderedList,
    },
    table: s.editorTable,
    tableCell: s.editorTableCell,
    tableCellHeader: s.editorTableHeader,
    tableScrollableWrapper: s.editorTableScroller,
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
}: BodyEditorProps) {
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
      <div className={s.bodyEditor}>
        <div className={s.bodyToolbar}>
          {mode === "visual" && <EditorToolbar profile={profile} />}
          <SlidingTabs
            className={s.modeToggleEnd}
            ariaLabel="Editing mode"
            options={[
              {
                key: "visual",
                label: "Visual",
                disabled: !visualAvailable,
                id: visualTabId,
                controls: visualPanelId,
              },
              {
                key: "markdown",
                label: "Markdown",
                id: markdownTabId,
                controls: markdownPanelId,
              },
            ]}
            value={mode}
            onChange={setRequestedMode}
          />
        </div>

        <div
          id={visualPanelId}
          role="tabpanel"
          aria-labelledby={visualTabId}
          hidden={mode !== "visual"}
          className={s.visualEditorPanel}
        >
          <ContentEditable
            id={`${id}-visual`}
            className={s.richBody}
            aria-label={ariaLabel}
            aria-placeholder="Write your content…"
            placeholder={
              <span className={s.editorPlaceholder}>Write your content…</span>
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
            <div className={s.sourceOnlyNotice} role="status">
              <strong>Markdown mode is required for this content.</strong>
              <span>{reasons.join(" ")}</span>
            </div>
          )}
          <textarea
            id={id}
            className={`${s.textarea} ${s.mono} ${s.bodyTextarea}`}
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
              className={s.sourceOnlyHelp}
            >
              Visual editing will become available when unsupported source is
              removed or converted to a supported component.
            </small>
          )}
        </div>

        <MarkdownSyncPlugin
          enabled={visualAvailable}
          value={value}
          onChange={onChange}
        />
      </div>
    </LexicalExtensionComposer>
  );
}
