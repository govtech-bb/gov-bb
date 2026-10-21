import { Fragment, type ReactNode } from "react";
import { Bar } from "./bar";
import { SaveState, type SaveStateProps } from "./save-state";

type DocumentBarProps = {
  /** Names its toolbar, such as “Page tools”. */
  label: string;
  /** The document's title: the screen's h1. */
  title: ReactNode;
  /** Where its work stands: beside the title, and a failed save's message first among the notices. */
  save?: SaveStateProps;
  /** Undo and redo. */
  undo?: ReactNode;
  preview?: ReactNode;
  /** The document's source: its Markdown, and a form's JSON. */
  source?: ReactNode;
  /** Sends the changes on for everyone: Publish changes, or Save. */
  publish?: ReactNode;
  /** Shows and hides the document's settings. */
  settings?: ReactNode;
  /** What stands in the document's way, edge to edge under the bar, such as editing that's paused. */
  notices?: ReactNode;
  /** Out of sight while another document is open, but still keeping count of what can be undone. */
  hidden?: boolean;
};

/**
 * The bar over every document: the same slots in the same order for a page
 * and a form, so the author finds each thing where they left it. The title, where it stands, undo and redo, the ways
 * to look at it, publishing, then its settings; each group ruled off from the next. Its notices sit under it.
 */
export function DocumentBar({
  label,
  title,
  save,
  undo,
  preview,
  source,
  publish,
  settings,
  notices,
  hidden,
}: DocumentBarProps) {
  const views = (preview || source) && (
    <>
      {preview}
      {source}
    </>
  );

  // The groups there are, in their order: each keyed by its slot, so none is remounted as others come and go
  const groups = (
    [
      ["undo", undo],
      ["views", views],
      ["publish", publish],
      ["settings", settings],
    ] as const
  ).flatMap(([slot, group]) => (group ? [{ slot, group }] : []));

  return (
    <>
      {/* Pinned to the top as the document scrolls under it, from a tablet up: the save state and
          the tools stay in reach. A phone's screen is left to the writing */}
      <Bar.Root
        label={label}
        hidden={hidden}
        data-document-bar=""
        className="md:sticky md:top-0 md:z-10 md:flex-nowrap"
      >
        {/* The title is cut short to make room: for the tools beside it from a tablet up, where the bar keeps to one
            row, and for where it stands on a phone, where the tools have their own row */}
        <Bar.Title render={<h1 />} className="max-md:grow max-md:basis-0">
          {title}
        </Bar.Title>
        {save && (
          <Bar.Status>
            <SaveState.Status {...save} />
          </Bar.Status>
        )}
        {/* On a phone, the tools take their own row under the title, spread across it */}
        <Bar.Actions className="max-md:w-full max-md:justify-between">
          {groups.map(({ slot, group }, index) => (
            <Fragment key={slot}>
              {index > 0 && <Bar.Separator />}
              {group}
            </Fragment>
          ))}
        </Bar.Actions>
      </Bar.Root>
      {(save?.status === "failed" || notices) && (
        <div hidden={hidden}>
          {save && <SaveState.Failure {...save} />}
          {notices}
        </div>
      )}
    </>
  );
}
