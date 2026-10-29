import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info, PencilSimple } from "@phosphor-icons/react";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { LoadingState } from "../ui/loading-state";
import { Popover } from "../ui/popover";
import { SitePreviewInline } from "./site-preview-inline";
import { loadSitePreviewStyles } from "./site-preview-styles";
import {
  sitePreviewBase,
  sitePreviewDocument,
  type SitePreviewContext,
  type SitePreviewHandle,
  type SitePreviewRegions,
  type SitePreviewRenderer,
} from "./site-preview-renderer";

/** Site preview controls rendered in the shared document bar. */
export type SitePreviewTools = { edit: ReactNode; about: ReactNode };

/** Same-document site preview. No navigation, second editor, draft store or automatic save. */
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
  /** Renders preview tools in the host's document bar, without a second toolbar. */
  controls: (tools: SitePreviewTools) => ReactNode;
  writerScrollY: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ source, context });
  latest.current = { source, context };
  const [handle, setHandle] = useState<SitePreviewHandle>();
  const [regions, setRegions] = useState<SitePreviewRegions | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const aboutTitle = useId();

  useEffect(() => {
    let disposed = false;
    let renderer: SitePreviewHandle | undefined;
    let restoreStyles: (() => void) | undefined;
    const abort = new AbortController();
    const workspace = document.querySelector<HTMLElement>("[data-cms-workspace]");
    const hidden = workspace?.hidden;
    const inert = workspace?.inert;
    const href = location.href;

    if (workspace) {
      workspace.hidden = true;
      workspace.inert = true;
    }

    window.scrollTo(0, 0);
    setError(undefined);
    setHandle(undefined);

    const open = async () => {
      try {
        const base = sitePreviewBase();
        const entry = new URL("renderer.js", base).href;

        // SAFETY: this configured application bundle implements SitePreviewRenderer; authored URLs cannot select it.
        const [module, activateStyles] = await Promise.all([
          import(/* @vite-ignore */ entry) as Promise<SitePreviewRenderer>,
          loadSitePreviewStyles(base, abort.signal),
        ]);

        if (disposed) return;
        restoreStyles = activateStyles();
        renderer = await module.mountCmsPreview(
          container.current!,
          sitePreviewDocument(latest.current.source, latest.current.context),
          base.origin,
        );

        if (disposed) {
          renderer.dispose();

          return;
        }

        setHandle(renderer);
      } catch (cause) {
        if (disposed) return;
        restoreStyles?.();
        restoreStyles = undefined;
        setError(cause instanceof Error ? cause.message : "Site preview could not be opened.");
      }
    };

    void open();

    return () => {
      disposed = true;
      abort.abort();
      restoreStyles?.();

      if (workspace) {
        workspace.hidden = hidden!;
        workspace.inert = inert!;
      }

      // Let portals detach and Lexical finish reattaching before restoring focus.
      queueMicrotask(() => {
        renderer?.dispose();

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
  }, [attempt, writerScrollY]);

  useEffect(() => {
    if (!handle) return;
    let disposed = false;

    // Do not re-render the site's body under a live Lexical root.
    if (editing) {
      setRegions(handle.setEditing(true));

      return;
    }

    setRegions(null);
    // Let React remove its portals before landing replaces the reader's content.
    queueMicrotask(() => {
      if (disposed) return;
      void Promise.resolve()
        .then(() => {
          if (disposed) return;
          handle.setEditing(false);

          return handle.update(sitePreviewDocument(source, context));
        })
        .catch((cause: Error) => {
          if (!disposed) setError(cause.message);
        });
    });

    return () => {
      disposed = true;
    };
  }, [handle, editing, source, context]);

  const ready = !!handle && !error;

  const edit = (
    <Button
      aria-pressed={editing}
      icon={<PencilSimple weight={editing ? "fill" : "regular"} />}
      disabled={!ready || (!editing && paused)}
      onClick={() => onEditingChange(!editing)}
    >
      {/* Keep the full accessible name when the visible label is shortened. */}
      Edit<span className="max-sm:sr-only"> content</span>
    </Button>
  );

  const about = ready && (
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
      {error ? (
        <Banner
          tone="error"
          layout="strip"
          title="The preview can’t be shown"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setRegions(null);
                onEditingChange(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry preview
            </Button>
          }
        >
          Your working copy is unchanged. Close the preview to keep editing.
          <span className="block text-muted">{error}</span>
        </Banner>
      ) : (
        !handle && <LoadingState size="page" label="Loading site preview…" />
      )}
      <div ref={container} hidden={!!error} />
      {regions && !error && <SitePreviewInline regions={regions} />}
    </div>,
    document.body,
  );
}
