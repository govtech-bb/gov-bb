import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { categoryLabel } from "../api/categories";
import { ApiFailure, type ApiRevision, type EditorApi } from "../api/client";
import { apiMessage } from "../api/failure-messages";
import { pageFieldLabel } from "../api/page-markdown";
import { categoriesQuery, reviewQueueQuery, revisionQuery, rolesQuery } from "../api/queries";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { LoadingState } from "../ui/loading-state";
import { ScreenHeader } from "../ui/screen-header";
import { TextLink } from "../ui/text-link";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { lineDiff } from "./line-diff";
import { LoadFailure } from "./load-failure";
import { WorkspaceDialog } from "./workspace-dialog";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** A time the API stamped, as the author reads it. */
const At = ({ value }: { value: string }) => (
  <time dateTime={value} className="tabular-nums">
    {when.format(new Date(value))}
  </time>
);

/** Every change waiting for an approver, the longest-waiting first, each linking to its comparison. */
export function ReviewQueueScreen({ api }: { api: EditorApi }) {
  const queue = useQuery(reviewQueueQuery(api));
  const approver = useQuery(rolesQuery(api)).data?.includes("approver") ?? false;

  return (
    <>
      <ScreenHeader
        title="Review queue"
        lead={
          approver
            ? "Changes to live pages waiting for an approver. Open one to compare it with the live page, then publish or reject it."
            : "Changes to live pages waiting for an approver. Citizens see them once an approver publishes them."
        }
      />
      {queue.isError && !queue.data ? (
        <LoadFailure
          noun="the review queue"
          error={queue.error}
          retrying={queue.isFetching}
          retry={() => void queue.refetch()}
        />
      ) : !queue.data ? (
        <LoadingState label="Loading the review queue…" />
      ) : queue.data.length === 0 ? (
        <EmptyState
          title="Nothing is waiting for review"
          description="Changes submitted for review show here."
        />
      ) : (
        <ul className="divide-y divide-line rounded-sm border border-line bg-white">
          {queue.data.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-4 py-3">
              <TextLink
                className="w-fit font-semibold"
                render={<Link to="/reviews/$pageId" params={{ pageId: entry.page_id }} />}
              >
                {entry.title}
              </TextLink>
              <span className="font-mono text-12 wrap-anywhere text-muted">{entry.url}</span>
              <span className="text-14 text-muted">
                Submitted by {entry.submitted_by_name ?? "a former employee"} on{" "}
                <At value={entry.submitted_at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const FIELD_NAMES = new Map([
  ["body_markdown", "Content"],
  ["frontmatter", "Page settings"],
]);

const fieldName = (field: string) => FIELD_NAMES.get(field) ?? pageFieldLabel(field);

/** A field's value as the API compares it: whatever the page field holds. */
type FieldValue = ApiRevision["changes"][number]["live"];

/** A field's value as text an approver can read: a category by its name, nothing as “None”. */
function valueText(
  field: string,
  value: FieldValue,
  categoryName: (id: string) => string | undefined,
) {
  if (value === null || value === undefined || value === "") return "None";

  if (field === "category_id" && String(value) === value) return categoryName(value) ?? value;

  return String(value) === value ? value : JSON.stringify(value, null, 2);
}

/** The page's content, line by line: what the change removes struck through, what it adds marked, in words too. */
function ContentDiff({ live, proposed }: { live: string; proposed: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm border border-line bg-white py-2 font-mono text-12 leading-5 whitespace-pre-wrap">
      {lineDiff(live, proposed).map((line, index) =>
        line.kind === "same" ? (
          <div key={index} className="px-3">
            <span aria-hidden="true">{"  "}</span>
            {line.text || " "}
          </div>
        ) : line.kind === "removed" ? (
          <del key={index} className="block bg-red-10 px-3 text-red-80">
            <span className="sr-only">Removed: </span>
            <span aria-hidden="true">- </span>
            {line.text || " "}
          </del>
        ) : (
          <ins key={index} className="block bg-green-10 px-3 text-green-80 no-underline">
            <span className="sr-only">Added: </span>
            <span aria-hidden="true">+ </span>
            {line.text || " "}
          </ins>
        ),
      )}
    </pre>
  );
}

/** What the change does to each field it touches, against the live page. */
function Changes({ api, revision }: { api: EditorApi; revision: ApiRevision }) {
  const categories = useQuery(categoriesQuery(api)).data;

  const categoryName = (id: string) => {
    const category = categories?.find((item) => item.id === id);

    return category && categoryLabel(category, categories ?? []);
  };

  if (revision.changes.length === 0)
    return <p className="text-14 text-muted">This change matches the live page.</p>;

  return (
    <ul className="flex flex-col gap-6">
      {revision.changes.map((change) => (
        <li key={change.field}>
          <h3 className="mb-2 text-16 font-semibold">{fieldName(change.field)}</h3>
          {change.field === "body_markdown" ? (
            <ContentDiff
              live={String(change.live ?? "")}
              proposed={String(change.proposed ?? "")}
            />
          ) : (
            <dl className="grid gap-x-4 gap-y-1 text-14 sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold">Live</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">
                <del className="no-underline">
                  {valueText(change.field, change.live, categoryName)}
                </del>
              </dd>
              <dt className="font-semibold">Proposed</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">
                <ins className="no-underline">
                  {valueText(change.field, change.proposed, categoryName)}
                </ins>
              </dd>
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

const STATUS = {
  draft: { label: "Not submitted", tone: "neutral" },
  submitted: { label: "Waiting for review", tone: "info" },
  rejected: { label: "Rejected", tone: "error" },
  published: { label: "Published", tone: "success" },
} as const;

type Decision = "publish" | "reject";

/** Why a decision was refused, and whether the change must be read again before deciding. */
type Refusal = { message: string; reload: boolean };

/** Why a decision was refused, in words the approver can act on; `reload` when the change must be read again first. */
function refusal(error: Error, decision: Decision): Refusal {
  const status = error instanceof ApiFailure ? error.status : 0;
  const message = error instanceof ApiFailure ? apiMessage(error) : undefined;

  switch (status) {
    case 403:
      return {
        message: message ?? `You can't ${decision} this change.`,
        reload: true,
      };
    case 404:
    case 409:
      return {
        message:
          "This change was updated or decided on after you opened it. We've loaded it again: check it before you decide.",
        reload: true,
      };
    case 401:
      return { message: "Your session has ended. Sign in again, then try again.", reload: false };
    case 422:
      return {
        message:
          (error instanceof ApiFailure &&
            error.errors.map((item) => `${fieldName(item.field)}: ${item.message}`).join(" ")) ||
          "This change can't be published as it stands.",
        reload: false,
      };
    default:
      return {
        message:
          status === 0
            ? "The content API could not be reached. Try again."
            : `We could not ${decision} this change. Try again.`,
        reload: false,
      };
  }
}

const MAX_COMMENT = 2000;

/**
 * One page's change against its live page. An approver publishes or rejects it at the version shown; anyone else
 * reads it only.
 */
export function ReviewScreen({ api, pageId }: { api: EditorApi; pageId: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const revision = useQuery(revisionQuery(api, pageId));
  const approver = useQuery(rolesQuery(api)).data?.includes("approver") ?? false;

  const submitter = useQuery(reviewQueueQuery(api)).data?.find(
    (entry) => entry.page_id === pageId,
  )?.submitted_by_name;

  // The version the approver opened the decision on, so a change that moves underneath it is refused, not decided
  const [deciding, setDeciding] = useState<{ decision: Decision; reviewed: string }>();
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const commentField = useRef<HTMLTextAreaElement>(null);
  const [screenError, setScreenError] = useState("");

  const decide = useMutation({
    mutationFn: async ({ decision, reviewed }: { decision: Decision; reviewed: string }) => {
      if (decision === "publish") await api.publishRevision(pageId, reviewed);
      else await api.rejectRevision(pageId, comment.trim(), reviewed);
    },
    onSuccess: async (_result, { decision }) => {
      toast(decision === "publish" ? "Change published" : "Change rejected", {
        description:
          decision === "publish"
            ? "Citizens now see it on the live page."
            : "The editor sees your comment with the change.",
      });
      setDeciding(undefined);
      // Left first, so this screen doesn't read the change it just decided on again
      await navigate({ to: "/reviews" });
      document.getElementById("workspace-content")?.focus();
      void client.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (error, { decision }) => {
      const refused = refusal(error, decision);

      if (!refused.reload) return;
      // Closed, so nothing is decided on a version the approver hasn't seen
      setDeciding(undefined);
      setScreenError(refused.message);
      void client.invalidateQueries({ queryKey: ["content"] });
    },
  });

  const open = (decision: Decision) => {
    if (!revision.data) return;
    decide.reset();
    setScreenError("");
    setComment("");
    setCommentError("");
    setDeciding({ decision, reviewed: revision.data.updated_at });
  };

  const close = () => {
    if (!decide.isPending) setDeciding(undefined);
  };

  const dialogError =
    decide.error && deciding && !refusal(decide.error, deciding.decision).reload
      ? refusal(decide.error, deciding.decision).message
      : undefined;

  const back = (
    <TextLink render={<Link to="/reviews" />} className="text-14">
      Back to the review queue
    </TextLink>
  );

  const missing = revision.error instanceof ApiFailure && revision.error.status === 404;

  if (missing)
    return (
      <EmptyState
        kind="not-found"
        title="Nothing is waiting for review on this page"
        description="It may have been published or rejected already."
        actions={back}
      />
    );

  if (revision.isError && !revision.data)
    return (
      <LoadFailure
        noun="this change"
        error={revision.error}
        retrying={revision.isFetching}
        retry={() => void revision.refetch()}
      />
    );

  if (!revision.data) return <LoadingState label="Loading the change…" />;

  const change = revision.data;
  const status = STATUS[change.status];
  const decidable = approver && change.status === "submitted";

  return (
    <>
      <div className="mb-4">{back}</div>
      <ScreenHeader
        title={change.fields.title}
        lead={
          <>
            <span className="font-mono wrap-anywhere">{change.fields.url}</span>
            {change.submitted_at && (
              <>
                <br />
                Submitted {submitter ? `by ${submitter} ` : ""}on <At value={change.submitted_at} />
              </>
            )}
          </>
        }
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {screenError && (
        <Banner tone="error" className="mb-6">
          {screenError}
        </Banner>
      )}
      {change.status === "rejected" && (
        <Banner tone="warning" title="An approver rejected this change" className="mb-6">
          {change.comment}
        </Banner>
      )}
      {change.status === "draft" && (
        <Banner tone="info" className="mb-6">
          This change hasn't been submitted for review yet.
        </Banner>
      )}
      <section aria-labelledby="review-changes" className="mb-8">
        <h2 id="review-changes" className="mb-4 text-20 font-semibold">
          What changes on the live page
        </h2>
        <Changes api={api} revision={change} />
      </section>
      {decidable ? (
        <div className="flex flex-wrap gap-2">
          <Button size="md" variant="accent" onClick={() => open("publish")}>
            Approve and publish
          </Button>
          <Button size="md" variant="secondary" onClick={() => open("reject")}>
            Reject
          </Button>
        </div>
      ) : (
        change.status === "submitted" &&
        !approver && (
          <p className="text-14 text-muted">An approver will publish or reject this change.</p>
        )
      )}
      <ConfirmDialog
        open={deciding?.decision === "publish"}
        onClose={close}
        title="Publish this change?"
        description={`Citizens will see it at ${change.fields.url} straight away.`}
        confirm="Approve and publish"
        pendingLabel="Publishing…"
        pending={decide.isPending}
        tone="accent"
        error={dialogError}
        onConfirm={() => deciding && decide.mutate(deciding)}
      />
      {deciding?.decision === "reject" && (
        <WorkspaceDialog
          title="Reject this change"
          description="The live page stays as it is. The editor sees your comment with their change."
          close={close}
          onSubmit={() => {
            const trimmed = comment.trim();

            const problem = !trimmed
              ? "Enter why you're rejecting this change"
              : trimmed.length > MAX_COMMENT
                ? `Use ${MAX_COMMENT} characters or fewer`
                : "";

            // Shown before the focus moves, so a screen reader reads the error with the field it lands on
            flushSync(() => setCommentError(problem));

            if (problem) return commentField.current?.focus();
            decide.mutate(deciding);
          }}
          body={
            <>
              <Field
                label="Why are you rejecting it?"
                hint="Say what the editor needs to change."
                error={commentError}
              >
                <Textarea
                  ref={commentField}
                  rows={5}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </Field>
              {dialogError && (
                <Banner tone="error" className="mt-4">
                  {dialogError}
                </Banner>
              )}
            </>
          }
          footer={
            <>
              <Button size="md" type="button" disabled={decide.isPending} onClick={close}>
                Cancel
              </Button>
              <Button size="md" type="submit" variant="danger" pending={decide.isPending}>
                {decide.isPending ? "Rejecting…" : "Reject change"}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}
