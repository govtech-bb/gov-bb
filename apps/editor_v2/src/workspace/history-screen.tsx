import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import type { ApiPage, EditorApi, PageHistoryEntry } from "../api/client";
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
  const client = useQueryClient();
  const history = useQuery(historyQuery(api, pageId));
  const page = useQuery(pageQuery(api, pageId));
  const editor = useQuery(rolesQuery(api)).data?.includes("editor") ?? false;
  const load = listLoadView(history, "this page’s history");
  const entries = history.data;
  const [shown, setShown] = useState(SHOWN);
  const list = useRef<HTMLOListElement>(null);
  const [restoring, setRestoring] = useState<{ entry: PageHistoryEntry; page: ApiPage }>();
  // The page's current version is the newest one: restoring it would change nothing
  const current = entries?.find((entry) => VERSIONS.has(entry.action))?.version_no;
  const isPublic = restoring?.page.visibility === "public";
  const restore = useWrite(api, writes.restorePage);
  const outcome = restore.outcome;

  useLayoutEffect(() => {
    if (outcome?.kind === "landed") {
      const restoredPage = outcome.answer;
      toast("Version restored", {
        description:
          restoredPage.visibility !== "public"
            ? "It's saved as a new change at the top of the history."
            : restoredPage.pending_revision?.status === "submitted"
              ? "It's saved in the change that is waiting for review."
              : "It's saved as a change to this page. Submit it for review to publish it.",
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
                  VERSIONS.has(entry.action) &&
                  entry.version_no !== current && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1 w-fit"
                      onClick={() => {
                        if (!page.data) return;
                        restore.forget();
                        setRestoring({ entry, page: structuredClone(page.data) });
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
            ? `The page as it was on ${formatDayAndTime(restoring.entry.occurred_at)} is saved as a change to it. Citizens keep seeing the live page until an approver publishes the change. Nothing in the history is removed.`
            : `The page goes back to how it was on ${formatDayAndTime(restoring.entry.occurred_at)}. This is added to the history as a new change: nothing is removed. Who can see the page doesn't change.`)
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
            ? "We couldn’t confirm whether this version was restored. You can retry the same request, or cancel to check the page and its history."
            : outcome.kind === "conflict"
              ? "This page changed. Cancel and review the latest version before restoring."
              : outcome.message || "The version couldn't be restored. Try again.")
        }
        onConfirm={() => {
          if (!restoring || outcome?.kind === "conflict") return;
          void restore.press(() => ({
            id: restoring.page.id,
            versionNo: restoring.entry.version_no,
            version: restoring.page.version,
          }));
        }}
      />
    </>
  );
}
