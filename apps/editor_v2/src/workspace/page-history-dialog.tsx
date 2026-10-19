import { Check, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type Ref } from "react";
import type { ApiPage, EditorApi, PageVersion, TaxonomyCategory } from "../api/client";
import { pageToMarkdown, pageVersionToDraftMarkdown } from "../api/page-markdown";
import { pageHistoryQuery, pageVersionQuery } from "../api/queries";
import { cn } from "../cn";
import { PagePreviewSurface } from "../host/page-editor";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { hiddenControlFocus } from "../ui/focus";
import { LoadingState } from "../ui/loading-state";
import { groupLabel } from "../ui/surface";

const ACTIONS = {
  created: "Created",
  updated: "Updated",
  published: "Published",
  reverted: "Restored",
  deleted: "Deleted",
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const who = (version: PageVersion) => version.actor.name ?? version.actor.email ?? version.actor.id;

const date = (version: PageVersion) => when.format(new Date(version.occurred_at));

/** One version in the list. A radio, so arrow keys move the selection and the preview follows. */
function VersionOption({
  ref,
  name,
  label,
  actor,
  detail,
  checked,
  select,
}: {
  ref?: Ref<HTMLInputElement>;
  name: string;
  label: string;
  actor?: string;
  detail?: string;
  checked: boolean;
  select: () => void;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2.5 hover:bg-tint has-checked:bg-highlight",
        hiddenControlFocus,
      )}
    >
      <input
        ref={ref}
        type="radio"
        name={name}
        checked={checked}
        onChange={select}
        className="sr-only"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-14 leading-5 font-semibold">{label}</span>
        {actor && (
          <span className="flex min-w-0 items-center gap-2 text-13 leading-5 text-muted">
            <span
              aria-hidden="true"
              className="grid size-4.5 shrink-0 place-items-center rounded-full bg-blue-20 text-12 leading-none font-bold text-blue-80"
            >
              {actor.charAt(0).toUpperCase()}
            </span>
            <span className="truncate">{actor}</span>
            <span className="shrink-0">· {detail}</span>
          </span>
        )}
      </span>
      <Check
        aria-hidden="true"
        className={cn("size-4 shrink-0 text-interactive", !checked && "invisible")}
      />
    </label>
  );
}

/** A page's saved versions, newest first, beside a preview of the one chosen; an earlier one can be brought back into the draft. */
export function PageHistoryDialog({
  api,
  current,
  categories,
  canRestore,
  close,
  restore,
}: {
  api: EditorApi;
  current: ApiPage;
  categories: readonly TaxonomyCategory[];
  canRestore: boolean;
  close: () => void;
  restore: (markdown: string) => void;
}) {
  const history = useQuery(pageHistoryQuery(api, current.id));
  // Undefined is the current version, so the selection follows a newer save.
  const [selected, setSelected] = useState<number>();
  const name = useId();
  const currentOption = useRef<HTMLInputElement>(null);

  const snapshot = useQuery({
    ...pageVersionQuery(api, current.id, selected ?? 0),
    enabled: selected !== undefined,
  });

  const latest = history.data?.[0];
  const earlier = history.data?.slice(1) ?? [];

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Content
        size="full"
        close={false}
        initialFocus={currentOption}
        className="h-[90dvh] flex-row pb-0"
      >
        {/* Focusable so the keyboard can scroll a version with no links in it */}
        <div
          role="region"
          aria-label="Version preview"
          tabIndex={0}
          className="min-w-0 flex-1 overflow-y-auto focus-visible:-outline-offset-5 focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)] max-sm:hidden"
        >
          <div className="mx-auto w-full max-w-226 px-[clamp(1.5rem,4vw,4rem)] pt-[clamp(2rem,4vw,3rem)] pb-16">
            {selected === undefined ? (
              <PagePreviewSurface source={pageToMarkdown(current, categories)} />
            ) : snapshot.data ? (
              <PagePreviewSurface
                source={pageVersionToDraftMarkdown(current, snapshot.data, categories)}
              />
            ) : snapshot.isError ? (
              <EmptyState
                kind="failed"
                size="inline"
                title="This version can no longer be shown"
                description="Choose another version from the list."
              />
            ) : (
              <LoadingState label="Loading version…" />
            )}
          </div>
        </div>
        <div className="flex w-75 shrink-0 flex-col border-s border-line max-sm:w-full max-sm:border-s-0">
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line ps-3.5 pe-2">
            <Dialog.Title className="pe-0 text-14">Version history</Dialog.Title>
            <Dialog.Close render={<Button icon={<X />} aria-label="Close version history" />} />
          </div>
          <fieldset className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
            <legend className="sr-only">Versions</legend>
            <VersionOption
              ref={currentOption}
              name={name}
              label="Current version"
              actor={latest && who(latest)}
              detail={latest && date(latest)}
              checked={selected === undefined}
              select={() => setSelected(undefined)}
            />
            {history.data ? (
              <>
                <p className={cn(groupLabel, "mt-6 px-2")}>
                  {`${earlier.length || "No"} earlier ${earlier.length === 1 ? "version" : "versions"}`}
                </p>
                {earlier.map((entry) => (
                  <VersionOption
                    key={entry.version}
                    name={name}
                    label={date(entry)}
                    actor={who(entry)}
                    detail={ACTIONS[entry.action]}
                    checked={selected === entry.version}
                    select={() => setSelected(entry.version)}
                  />
                ))}
              </>
            ) : history.isError ? (
              <EmptyState
                kind="failed"
                size="inline"
                className="mt-6 px-2"
                title="We could not load this page's history"
                description="Check you are still signed in, then try again."
                actions={
                  <Button variant="secondary" onClick={() => void history.refetch()}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <LoadingState label="Loading history…" />
            )}
          </fieldset>
          <div className="flex shrink-0 flex-col gap-3 border-t border-line p-3.5">
            <Dialog.Description>
              Each save is a version. Restoring one brings back its title, introduction,
              description, form and body as unsaved changes; the path, category and visibility stay
              as they are.
            </Dialog.Description>
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={!canRestore || selected === undefined || !snapshot.data}
              onClick={() => {
                if (snapshot.data)
                  restore(pageVersionToDraftMarkdown(current, snapshot.data, categories));
              }}
            >
              Restore this version
            </Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
