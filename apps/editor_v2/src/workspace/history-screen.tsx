import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { PAGE_VERSIONS, type EditorApi, type PageHistoryEntry } from "../api/client";
import { writes } from "../api/writes";
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
import { useWrite } from "./use-write";

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
  const load = listLoadView(history, "this page’s history");
  const entries = history.data;
  const [shown, setShown] = useState(SHOWN);
  const list = useRef<HTMLOListElement>(null);

  const [restoring, setRestoring] = useState<{
    entry: PageHistoryEntry;
    pageId: string;
    version: number;
    isPublic: boolean;
    historyVersion: number;
  }>();

  // The page's current version is the newest one: restoring it would change nothing
  const current = entries?.find((entry) => PAGE_VERSIONS.has(entry.action))?.version_no;
  const restore = useWrite(api, writes.restorePage);
  const outcome = restore.outcome;

  useLayoutEffect(() => {
    if (outcome?.kind === "landed") {
      // The restored page, or the history that confirmed a lost answer for a page that isn't public
      const answer = outcome.answer;
      toast("Version restored", {
        description:
          Array.isArray(answer) || answer.visibility !== "public"
            ? "Saved as a new change at the top of the history."
            : answer.pending_revision?.status === "submitted"
              ? "The change is still waiting for review."
              : "Saved as a change. Submit it for review to publish it.",
      });
      setRestoring(undefined);
    } else if (
      outcome?.kind === "conflict" ||
      (outcome?.kind === "refused" && outcome.code === "not_restorable")
    )
      void client.invalidateQueries({ queryKey: ["content"] });
  }, [outcome, client]);

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
                  PAGE_VERSIONS.has(entry.action) &&
                  entry.version_no !== current && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1 w-fit"
                      onClick={() => {
                        if (!page.data || current === undefined) return;
                        const { id, version, visibility } = page.data;

                        restore.forget();
                        setRestoring({
                          entry,
                          pageId: id,
                          version,
                          isPublic: visibility === "public",
                          historyVersion: current,
                        });
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
          (restoring.isPublic
            ? `Restore the version from ${formatDayAndTime(restoring.entry.occurred_at)} as a change for review. Citizens keep seeing the live page until an approver publishes the change. Nothing is removed from history.`
            : `Restore the version from ${formatDayAndTime(restoring.entry.occurred_at)} as a new change. Nothing is removed from history, and who can see the page won’t change.`)
        }
        confirmLabel={restore.state === "unsettled" ? "Retry restore" : "Restore version"}
        confirmDisabled={outcome?.kind === "conflict"}
        pendingLabel="Restoring…"
        pending={restore.state === "sending" || restore.state === "checking"}
        variant="accent"
        error={
          outcome &&
          outcome.kind !== "landed" &&
          (outcome.kind === "unknown"
            ? "We couldn’t confirm the restore. Retry, or cancel to check the page and its history."
            : outcome.kind === "conflict"
              ? "This page changed. Cancel and review the latest version before restoring."
              : outcome.message || "Couldn’t restore this version. Try again.")
        }
        onConfirm={() => {
          if (!restoring || outcome?.kind === "conflict") return;
          void restore.press(() => ({
            id: restoring.pageId,
            versionNo: restoring.entry.version_no,
            version: restoring.version,
            isPublic: restoring.isPublic,
            historyVersion: restoring.historyVersion,
          }));
        }}
      />
    </>
  );
}
