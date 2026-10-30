import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Info, PencilSimple } from "@phosphor-icons/react";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { Popover } from "../ui/popover";
import { prepareProsePage } from "../templates/prose-page-content";
import { SitePreviewInline } from "./site-preview-inline";
import { sitePreviewDocument, type SitePreviewContext } from "./site-preview-renderer";

/** Site preview controls rendered in the shared document bar. */
export type SitePreviewTools = { edit: ReactNode; about: ReactNode };

/** Local prose page preview; opening and closing never save, publish or replace the editor. */
export function SitePreview({
  source,
  context,
  editing,
  paused,
  onEditingChange,
  controls,
  writerScrollY,
}: {
  source: string;
  context?: SitePreviewContext;
  editing: boolean;
  paused: boolean;
  onEditingChange: (editing: boolean) => void;
  controls: (tools: SitePreviewTools) => ReactNode;
  writerScrollY: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const aboutTitle = useId();

  const preview = useMemo(() => {
    try {
      if (!("CSSScopeRule" in window))
        throw new Error(
          "Site preview needs a browser with CSS scope support. You can still use the writer.",
        );

      return { page: prepareProsePage(sitePreviewDocument(source, context)) };
    } catch (cause) {
      return {
        error: cause instanceof Error ? cause.message : "Site preview could not be opened.",
      };
    }
  }, [source, context, attempt]);

  useEffect(() => {
    const workspace = document.querySelector<HTMLElement>("[data-cms-workspace]");
    const hidden = workspace?.hidden;
    const inert = workspace?.inert;
    const href = location.href;

    if (workspace) {
      workspace.hidden = true;
      workspace.inert = true;
    }

    window.scrollTo(0, 0);

    return () => {
      if (workspace) {
        workspace.hidden = hidden!;
        workspace.inert = inert!;
      }

      // Let Lexical reattach to the writer before restoring focus.
      queueMicrotask(() => {
        if (location.href === href && !document.querySelector("[data-cms-preview-host]")) {
          document
            .querySelector<HTMLElement>(
              "[data-cms-workspace] [data-document-bar]:not([hidden]) [data-site-preview-trigger]",
            )
            ?.focus({ preventScroll: true });
          window.scrollTo(0, writerScrollY);
        }
      });
    };
  }, [writerScrollY]);

  const edit = (
    <Button
      aria-pressed={editing}
      icon={<PencilSimple weight={editing ? "fill" : "regular"} />}
      disabled={!preview.page || (!editing && paused)}
      onClick={() => onEditingChange(!editing)}
    >
      Edit<span className="max-sm:sr-only"> content</span>
    </Button>
  );

  const about = preview.page && (
    <Popover.Root>
      <Popover.Trigger render={<Bar.Tool icon={<Info />} label="About this preview" />} />
      <Popover.Content aria-labelledby={aboutTitle} align="end" className="w-88">
        <Popover.Title id={aboutTitle}>About this preview</Popover.Title>
        <ul className="mt-2 grid list-disc gap-2 ps-5 text-14 text-ink">
          <li>
            Changes stay in your working copy until you save or publish them. Closing the preview or
            turning off editing saves nothing.
          </li>
          <li>Links, buttons and the feedback form don’t work here.</li>
        </ul>
      </Popover.Content>
    </Popover.Root>
  );

  return createPortal(
    <div data-cms-preview-host="">
      {controls({ edit, about })}
      {preview.page ? (
        <SitePreviewInline page={preview.page} editing={editing} />
      ) : (
        <Banner
          tone="error"
          layout="strip"
          title="The preview can’t be shown"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                onEditingChange(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry preview
            </Button>
          }
        >
          Your working copy is unchanged. Close the preview to keep editing.
          <span className="block text-muted">{preview.error}</span>
        </Banner>
      )}
    </div>,
    document.body,
  );
}
