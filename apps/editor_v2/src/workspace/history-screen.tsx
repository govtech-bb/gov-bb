import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ApiFailure, type EditorApi, type PageHistoryEntry } from "../api/client";
import { pageFieldLabel } from "../api/page-markdown";
import { historyQuery, pageQuery } from "../api/queries";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { ScreenHeader } from "../ui/screen-header";
import { TextLink } from "../ui/text-link";
import { LoadFailure } from "./load-failure";

/** A history screen's address: `service` is the service it was opened from, for the way back. */
export type HistorySearch = { service?: string };

/** Keeps a non-empty `service` from the address, and drops anything else. */
export function parseHistorySearch(search: { readonly service?: unknown }): HistorySearch {
  const { service } = search;

  return String(service) === service && service ? { service } : {};
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

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

/** Who did it: their name, the system for imports and seeding, or a former employee. */
const byWhom = (entry: PageHistoryEntry) =>
  entry.actor_name ?? (entry.actor === "system" ? "the system" : "a former employee");

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
      ) : !history.data ? (
        <LoadingState label="Loading the page's history…" />
      ) : (
        <ol className="divide-y divide-line rounded-sm border border-line bg-white">
          {history.data.map((entry) => (
            <li key={entry.version_no} className="flex flex-col gap-1 px-4 py-3">
              <span className="font-semibold">
                {ACTIONS[entry.action]} by {byWhom(entry)}
              </span>
              <time dateTime={entry.occurred_at} className="text-14 text-muted tabular-nums">
                {when.format(new Date(entry.occurred_at))}
              </time>
              {entry.changed.length > 0 && (
                <span className="text-14">
                  Changed: {entry.changed.map(pageFieldLabel).join(", ")}
                </span>
              )}
              {entry.comment && <span className="text-14">Reason: {entry.comment}</span>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
