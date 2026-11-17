import { Warning } from "@phosphor-icons/react";
import { Fragment, type ReactNode } from "react";
import { cn } from "../cn";
import { Bar } from "./bar";
import { Button } from "./button";
import { Popover } from "./popover";
import { SaveState, type SaveStateProps } from "./save-state";

/** A notice that arrives while the document is being written: a few words, a tone, and what it says once opened. */
export type DocumentAlert = { label: string; tone: "warning" | "error"; content: ReactNode };

type DocumentBarProps = {
  /** Names its toolbar, such as “Page tools”. */
  label: string;
  /** Before the title: what shows the list beside the document, such as its service's pages, while it's hidden. */
  nav?: ReactNode;
  /** The document title, rendered as an h1 by default. */
  title: ReactNode;
  /** Use false when the content already supplies the page heading. */
  heading?: boolean;
  /** Where its work stands: beside the title, and a failed save's message first among the notices. */
  save?: SaveStateProps;
  /** Undo and redo. */
  undo?: ReactNode;
  preview?: ReactNode;
  /** The document's source: its Markdown, and a form's JSON. */
  source?: ReactNode;
  /** Sends the changes on for everyone: Publish changes, or Save. */
  publish?: ReactNode;
  /** Shows and hides the document's settings: at the far end, right above the panel it opens. */
  settings?: ReactNode;
  /** What stands in the document's way, edge to edge under the bar, such as editing that's paused. */
  notices?: ReactNode;
  /**
   * A notice that arrives while the document is being written, such as a newer version saved elsewhere. Its few words
   * sit beside where the document stands and open what it says and what can be done: it comes and goes there without
   * moving the writing or covering it.
   */
  alert?: DocumentAlert;
  /** Out of sight while another document is open, but still keeping count of what can be undone. */
  hidden?: boolean;
};

// A late notice: a badge's tint in its tone, kept under the pointer and edged there and while open, as a pill is
const alertLooks = {
  warning: "bg-yellow-20 text-ink pressable:hover:bg-yellow-20 pressable:hover:text-ink",
  error: "bg-red-10 text-red-80 pressable:hover:bg-red-10 pressable:hover:text-red-80",
};

/**
 * The bar over every document: the same slots in the same order for a page
 * and a form, so the author finds each thing where they left it. The title, where it stands, undo and redo, the ways
 * to look at it, publishing, then its settings; each group ruled off from the next. A panel's toggle sits at the bar's
 * edge on the panel's side: the list of pages before the title, the settings at the end. Its notices sit under it.
 */
export function DocumentBar({
  label,
  nav,
  title,
  heading = true,
  save,
  undo,
  preview,
  source,
  publish,
  settings,
  notices,
  alert,
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
      {/* Pinned to the top as the document scrolls under it, from a tablet up on a screen tall enough (bar-pinned):
          the save state and the tools stay in reach. A phone's screen, upright or on its side, is left to the writing */}
      <Bar.Root
        label={label}
        hidden={hidden}
        data-document-bar=""
        className="bar-pinned:sticky bar-pinned:top-0 bar-pinned:z-bar md:flex-nowrap"
      >
        {/* The title is cut short to make room: for the tools beside it from a tablet up, where the bar keeps to one
            row, and for where it stands on a phone, where the tools have their own row */}
        {nav}
        {/* The heading can take the focus when what had it goes, such as a notice's button that answered it */}
        <Bar.Title
          render={heading ? <h1 tabIndex={-1} /> : undefined}
          className="max-md:grow max-md:basis-0"
        >
          {title}
        </Bar.Title>
        {save && (
          <Bar.Status>
            <SaveState.Status {...save} />
          </Bar.Status>
        )}
        {alert && !hidden && (
          <Popover.Root>
            <Popover.Trigger
              render={
                <Button
                  data-document-alert=""
                  size="xs"
                  variant="secondary"
                  icon={<Warning weight="fill" />}
                  className={cn(
                    alertLooks[alert.tone],
                    "pressable:hover:shadow-input-hover data-popup-open:shadow-input-hover",
                  )}
                >
                  {alert.label}
                </Button>
              }
            />
            <Popover.Content aria-label={alert.label} align="start" className="w-104 p-0">
              {alert.content}
            </Popover.Content>
          </Popover.Root>
        )}
        {/* Read out as a notice arrives, as what it says waits to be opened */}
        <span aria-live="polite" className="sr-only">
          {!hidden && alert?.label}
        </span>
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
