import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { ApiFailure, type EditorApi, type PageHistoryEntry } from "../api/client";
import { apiMessage } from "../api/failure-messages";
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
import { LoadFailure } from "./load-failure";

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

/** Entries whose snapshot is the page itself, so a restore can bring it back (ADR 0080). */
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
  const client = useQueryClient();
  const history = useQuery(historyQuery(api, pageId));
  const page = useQuery(pageQuery(api, pageId));
  const editor = useQuery(rolesQuery(api)).data?.includes("editor") ?? false;
  const none = history.error instanceof ApiFailure && history.error.status === 404;
  const entries = history.data;
  const [shown, setShown] = useState(SHOWN);
  const list = useRef<HTMLOListElement>(null);
  const [restoring, setRestoring] = useState<PageHistoryEntry>();
  // The page's current version is the newest one: restoring it would change nothing
  const current = entries?.find((entry) => VERSIONS.has(entry.action))?.version_no;
  const isPublic = page.data?.visibility === "public";
  // The restore updates a change already sent for review, and it stays waiting
  const awaitingReview = page.data?.pending_revision?.status === "submitted";

  const restore = useMutation({
    mutationFn: ({ versionNo, read }: { versionNo: number; read: number }) =>
      api.restoreVersion(pageId, versionNo, read),
    onSuccess: () => {
      toast("Version restored", {
        description: !isPublic
          ? "It's saved as a new change at the top of the history."
          : awaitingReview
            ? "It's saved in the change that is waiting for review."
            : "It's saved as a change to this page. Submit it for review to publish it.",
      });
      setRestoring(undefined);
      void client.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (error) => {
      // The page moved on: read it and its history again, so trying again restores onto the current version
      if (error instanceof ApiFailure && error.status === 409)
        void client.invalidateQueries({ queryKey: ["content"] });
    },
  });

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
      {serviceId && (
        <TextLink
          className="mb-4 block w-fit"
          render={
            <Link
              to="/services/$serviceId/$documentId"
              params={{ serviceId, documentId: pageId }}
            />
          }
        >
          Back to the page
        </TextLink>
      )}
      <ScreenHeader
        title={page.data ? `History: ${page.data.title}` : "Page history"}
        lead="Every change to this page and every review step, newest first, with who made it and when."
      />
      {none ? (
        <EmptyState title="No history yet" description="Changes to this page will show here." />
      ) : history.isError && !history.data ? (
        <LoadFailure
          noun="this page’s history"
          error={history.error}
          retrying={history.isFetching}
          retry={() => void history.refetch()}
        />
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
                        restore.reset();
                        setRestoring(entry);
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
      <ConfirmDialog
        open={restoring !== undefined}
        onOpenChange={(open) => {
          if (!open) setRestoring(undefined);
        }}
        title="Restore this version?"
        description={
          restoring &&
          (isPublic
            ? `The page as it was on ${formatDayAndTime(restoring.occurred_at)} is saved as a change to it. Citizens keep seeing the live page until an approver publishes the change. Nothing in the history is removed.`
            : `The page goes back to how it was on ${formatDayAndTime(restoring.occurred_at)}. This is added to the history as a new change: nothing is removed. Who can see the page doesn't change.`)
        }
        confirmLabel="Restore version"
        pendingLabel="Restoring…"
        pending={restore.isPending}
        variant="accent"
        error={
          restore.error &&
          ((restore.error instanceof ApiFailure && apiMessage(restore.error)) ||
            "The version couldn't be restored. Try again.")
        }
        onConfirm={() =>
          restoring &&
          page.data &&
          restore.mutate({
            versionNo: restoring.version_no,
            read: page.data.version,
          })
        }
      />
    </>
  );
}
