import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { ApiFailure, type EditorApi, type PageHistoryEntry } from "../api/client";
import { pageFieldLabel } from "../api/page-fields";
import { historyQuery, pageQuery } from "../api/queries";
import { Button } from "../ui/button";
import { formatDayAndTime } from "../ui/dates";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { ScreenHeader } from "../ui/screen-header";
import { TextLink } from "../ui/text-link";
import { LoadFailure } from "./load-failure";

/** How many changes show at first, and how many more each Show older changes adds. */
const SHOWN = 50;

/** What each entry says happened, as an author reads it. */
const ACTIONS: Record<PageHistoryEntry["action"], string> = {
  created: "Created",
  updated: "Edited",
  published: "Made public",
  unpublished: "Taken out of public view",
  reverted: "Reverted",
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

/** Everything that happened to one page, newest first. Read-only: nothing here changes the page. */
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
  const none = history.error instanceof ApiFailure && history.error.status === 404;
  const entries = history.data;
  const [shown, setShown] = useState(SHOWN);
  const list = useRef<HTMLOListElement>(null);

  // Each Show older changes moves the focus to the first change it added: after the last, the button itself is gone
  useLayoutEffect(() => {
    if (shown > SHOWN) list.current?.querySelectorAll("li")[shown - SHOWN]?.focus();
  }, [shown]);

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
          noun="this page's history"
          error={history.error}
          retrying={history.isFetching}
          retry={() => void history.refetch()}
        />
      ) : !entries ? (
        <LoadingState label="Loading the page's history…" />
      ) : (
        <>
          <ol ref={list} className="divide-y divide-line rounded-sm border border-line bg-white">
            {entries.slice(0, shown).map((entry, index) => (
              <li key={entry.version_no} tabIndex={-1} className="flex flex-col gap-1 px-4 py-3">
                <span className="font-semibold">
                  {appliesApproval(entry, entries[index + 1])
                    ? "Approved change published"
                    : ACTIONS[entry.action]}{" "}
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
    </>
  );
}
