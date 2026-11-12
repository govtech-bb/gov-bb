import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import type { ApiPage, EditorApi, PageHistoryEntry } from "../api/client";
import { writes } from "../api/writes";
import { useWrite } from "./use-write";
import { pageFieldLabel } from "../api/page-fields";
import { historyQuery, pageQuery, rolesQuery } from "../api/queries";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { formatDayAndTime } from "../ui/dates";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { ScreenHeader } from "../ui/screen-header";
import { TextLink } from "../ui/text-link";
import { toast } from "../ui/toast";
import { listLoadView } from "./list-load-view";

/** How many changes show at first, and how many more each Show older changes adds. */
const SHOWN = 50;

/** What each entry says happened, as an author reads it. */
const ACTIONS: Record<PageHistoryEntry["action"], string> = {
  created: "Created",
  updated: "Edited",
  published: "Made public",
  unpublished: "Taken out of public view",
  reverted: "Restored an earlier version",
  deleted: "Deleted",
  submitted: "Submitted for review",
  approved: "Approved and published",
  rejected: "Rejected",
  discarded: "Review closed when the page was taken out of public view",
};

/** Entries whose snapshot is the page itself, so a restore can bring it back (ADR 0135). */
const VERSIONS = new Set<PageHistoryEntry["action"]>([
  "created",
  "updated",
  "published",
  "unpublished",
  "reverted",
]);

/**
 * Whether an edit is the live write an approval let through: the API writes it in the approval's transaction, so
 * straight after it, by the same approver, at the same `occurred_at`. `older` is the entry before it.
 */
const appliesApproval = (entry: PageHistoryEntry, older: PageHistoryEntry | undefined) =>
  entry.action === "updated" &&
  older?.action === "approved" &&
  older.actor === entry.actor &&
  older.occurred_at === entry.occurred_at;

/** Who did it: the system for imports and seeding, though it has a user row named "System", or their name. */
const byWhom = (entry: PageHistoryEntry) =>
  entry.actor === "system" ? "the system" : (entry.actor_name ?? "a former employee");

/**
 * Everything that happened to one page, newest first. An editor can restore an earlier version, which saves it as a
 * new change: nothing in the history is removed.
 */
export function HistoryScreen({
  api,
  pageId,
  serviceId,
}: {
  api: EditorApi;
  pageId: string;
  serviceId?: string;
}) {
  const history = useQuery(historyQuery(api, pageId));
  const page = useQuery(pageQuery(api, pageId));
  const editor = useQuery(rolesQuery(api)).data?.includes("editor") ?? false;
  const load = listLoadView(history, "this page’s history");
  const entries = history.data;
  const [shown, setShown] = useState(SHOWN);
  const list = useRef<HTMLOListElement>(null);

  const [restoring, setRestoring] = useState<{
    entry: PageHistoryEntry;
    opened: number;
    open: boolean;
  }>();

  // The page's current version is the newest one: restoring it would change nothing
  const current = entries?.find((entry) => VERSIONS.has(entry.action))?.version_no;

  const back = serviceId ? (
    <Link to="/services/$serviceId/$documentId" params={{ serviceId, documentId: pageId }} />
  ) : page.data?.parent_id === null && page.data.category_id === null ? (
    <Link to="/site-pages/$pageId" params={{ pageId }} />
  ) : undefined;

  // Each Show older changes moves the focus to the first change it added: after the last, the button itself is gone
  useLayoutEffect(() => {
    if (shown > SHOWN) list.current?.querySelectorAll("li")[shown - SHOWN]?.focus();
  }, [shown]);

  const restoredWhen = (entry: PageHistoryEntry) => {
    const source = entries?.find((other) => other.version_no === entry.restored_from);

    return source && `Restored the version from ${formatDayAndTime(source.occurred_at)}`;
  };

  return (
    <>
      {back && (
        <TextLink className="mb-4 block w-fit" render={back}>
          Back to the page
        </TextLink>
      )}
      <ScreenHeader
        title={page.data ? `History: ${page.data.title}` : "Page history"}
        lead="Every change to this page and every review step, newest first, with who made it and when."
      />
      {load.notices}
      {load.state.kind === "blocked" && load.state.reason === "gone" ? (
        <EmptyState title="No history yet" description="Changes to this page will show here." />
      ) : load.state.kind === "blocked" ? (
        load.failure
      ) : !entries ? (
        <LoadingState label="Loading the page’s history…" />
      ) : (
        <>
          <ol ref={list} className="divide-y divide-line rounded-sm border border-line bg-white">
            {entries.slice(0, shown).map((entry, index) => (
              <li key={entry.version_no} tabIndex={-1} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">
                  {appliesApproval(entry, entries[index + 1])
                    ? "Approved change published"
                    : (entry.action === "reverted" && restoredWhen(entry)) ||
                      ACTIONS[entry.action]}{" "}
                  by {byWhom(entry)}
                </span>
                <time dateTime={entry.occurred_at} className="text-14 text-muted tabular-nums">
                  {formatDayAndTime(entry.occurred_at)}
                </time>
                {entry.changed.length > 0 && (
                  <span className="text-14">
                    Changed: {entry.changed.map(pageFieldLabel).join(", ")}
                  </span>
                )}
                {entry.comment && (
                  <span className="text-14 wrap-break-word">Reason: {entry.comment}</span>
                )}
                {editor &&
                  page.data &&
                  VERSIONS.has(entry.action) &&
                  entry.version_no !== current && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1 w-fit"
                      onClick={() => {
                        setRestoring((previous) => ({
                          entry,
                          opened: (previous?.opened ?? 0) + 1,
                          open: true,
                        }));
                      }}
                    >
                      Restore this version
                    </Button>
                  )}
              </li>
            ))}
          </ol>
          {entries.length > shown && (
            <Button
              variant="secondary"
              size="md"
              className="mt-4"
              onClick={() => setShown(shown + SHOWN)}
            >
              Show older changes
            </Button>
          )}
        </>
      )}
      {restoring && (
        <RestoreVersionDialog
          key={`${pageId}:${restoring.opened}`}
          api={api}
          pageId={pageId}
          page={page.data}
          entries={entries ?? []}
          entry={restoring.entry}
          open={restoring.open}
          onClose={() => setRestoring({ ...restoring, open: false })}
        />
      )}
    </>
  );
}

/** Each opening owns its attempt; closing an unknown restore cannot carry it into another version. */
function RestoreVersionDialog({
  api,
  pageId,
  page,
  entries,
  entry,
  open,
  onClose,
}: {
  api: EditorApi;
  pageId: string;
  page: ApiPage | undefined;
  entries: readonly PageHistoryEntry[];
  entry: PageHistoryEntry;
  open: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const restore = useWrite(api, writes.restoreVersion);
  const handled = useRef(restore.outcome);
  // Presentation only: the attempt owns the frozen request and history boundary.
  const [submitted, setSubmitted] = useState<{ isPublic: boolean; awaitingReview: boolean }>();

  const held =
    restore.state !== "idle" || restore.outcome?.kind === "landed" ? submitted : undefined;

  const isPublic = held?.isPublic ?? page?.visibility === "public";
  const awaitingReview = held?.awaitingReview ?? page?.pending_revision?.status === "submitted";

  const description = !isPublic
    ? "It's saved as a new change at the top of the history."
    : awaitingReview
      ? "It's saved in the change that is waiting for review."
      : "It's saved as a change to this page. Submit it for review to publish it.";

  useLayoutEffect(() => {
    const outcome = restore.outcome;

    if (!outcome || handled.current === outcome) return;
    handled.current = outcome;

    if (outcome.kind === "landed") {
      toast("Version restored", { description });
      onClose();
    } else if (
      outcome.kind === "conflict" ||
      (outcome.kind === "refused" && outcome.code === "restore_conflict")
    ) {
      // An answered conflict releases the attempt; the next press may use the refreshed page version.
      void client.invalidateQueries({ queryKey: ["content"] });
    }
  }, [restore.outcome, description, client, onClose]);

  const outcome = restore.outcome;

  const error =
    !outcome || outcome.kind === "landed"
      ? undefined
      : outcome.kind === "unknown"
        ? "We couldn’t tell whether that went through. Check your connection, then check again before you try again."
        : outcome.message || "The version couldn't be restored. Try again.";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Restore this version?"
      description={
        isPublic
          ? `The page as it was on ${formatDayAndTime(entry.occurred_at)} is saved as a change to it. Citizens keep seeing the live page until an approver publishes the change. Nothing in the history is removed.`
          : `The page goes back to how it was on ${formatDayAndTime(entry.occurred_at)}. This is added to the history as a new change: nothing is removed. Who can see the page doesn't change.`
      }
      confirmLabel={restore.state === "unsettled" ? "Check again" : "Restore version"}
      pendingLabel="Restoring…"
      pending={restore.state === "sending" || restore.state === "checking"}
      variant="accent"
      error={error}
      onConfirm={() => {
        if (!page || outcome?.kind === "landed") return;
        void restore.press(() => {
          setSubmitted({
            isPublic: page.visibility === "public",
            awaitingReview: page.pending_revision?.status === "submitted",
          });

          return {
            pageId,
            versionNo: entry.version_no,
            read: page.version,
            historyVersion: Math.max(0, ...entries.map((item) => item.version_no)),
            isPublic: page.visibility === "public",
          };
        });
      }}
    />
  );
}
