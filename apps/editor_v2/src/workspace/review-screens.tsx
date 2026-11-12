import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { categoryLabel } from "../api/categories";
import { ApiFailure, isText, type ApiRevision, type EditorApi } from "../api/client";
import type { Outcome } from "../api/write-attempt";
import { writes } from "../api/writes";
import { useWrite } from "./use-write";
import { pageLinkTargetsQuery } from "../api/page-link-targets";
import { pageFieldLabel } from "../api/page-fields";
import {
  categoriesQuery,
  employeeIdQuery,
  reviewQueueQuery,
  revisionQuery,
  rolesQuery,
} from "../api/queries";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { FormDialog } from "../ui/form-dialog";
import { LoadingState } from "../ui/loading-state";
import { ScreenHeader } from "../ui/screen-header";
import { TextLink } from "../ui/text-link";
import { Textarea } from "../ui/textarea";
import { toast } from "../ui/toast";
import { lineDiff } from "./line-diff";
import { listLoadView } from "./list-load-view";
import { LoadFailure } from "./load-failure";
import { brokenLinks, linkConfirmation, linksInMarkdown } from "./broken-links";

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
  const load = listLoadView(queue, "the review queue");
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
      {load.notices}
      {load.state.kind === "blocked" ? (
        load.failure
      ) : !queue.data ? (
        <LoadingState label={load.loadingLabel} />
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

/** A field's value as the API compares it: whatever the page field holds. */
type FieldValue = ApiRevision["changes"][number]["live"];

/** A field's value as text an approver can read: a category by its name, nothing as “None”. */
function valueText(
  field: string,
  value: FieldValue,
  categoryName: (id: string) => string | undefined,
) {
  if (value === null || value === undefined || value === "") return "None";

  if (field === "category_id" && isText(value)) return categoryName(value) ?? value;

  return isText(value) ? value : JSON.stringify(value, null, 2);
}

/** The page's content, line by line: what the change removes struck through, what it adds marked, in words too. */
export function ContentDiff({ live, proposed }: { live: string; proposed: string }) {
  // Not again on each keystroke in a dialog over it: it is quadratic in the lines
  const lines = useMemo(() => lineDiff(live, proposed), [live, proposed]);

  return (
    <pre className="overflow-x-auto rounded-sm border border-line bg-white py-2 font-mono text-12 leading-5 whitespace-pre-wrap wrap-anywhere">
      {lines.map((line, index) =>
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
          <h3 className="mb-2 text-16 font-semibold">{pageFieldLabel(change.field)}</h3>
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
  discarded: { label: "Discarded", tone: "neutral" },
} as const;

type Decision = "publish" | "reject";

/** Why a decision was refused, and whether the change must be read again before deciding. */
type Refusal = { message: string; reload: boolean };

/**
 * Why a decision was refused, in words the approver can act on; `reload` when the change must be read again first.
 * `afterUnknown` when an earlier attempt got no answer: that attempt may be what moved the change on.
 */
function refusal(outcome: Outcome<unknown>, decision: Decision, afterUnknown = false): Refusal {
  const done = decision === "publish" ? "published" : "rejected";

  if (outcome.kind === "unknown")
    return {
      message: `We didn't get an answer, so we don't know if the change was ${done}. Try again to send the same decision. If the first one went through, it won't be applied twice.`,
      reload: false,
    };

  if (afterUnknown && (outcome.kind === "missing" || outcome.kind === "conflict"))
    return {
      message: `We still can't confirm your earlier attempt. The change has moved on since you opened it, either from that attempt or from someone else. Check where it stands before deciding again.`,
      reload: true,
    };

  switch (outcome.kind) {
    case "forbidden":
      return { message: outcome.message ?? `You can't ${decision} this change.`, reload: true };
    case "conflict":
      return {
        message:
          "This change was edited after you opened it, so nothing was decided. Review the latest version below before deciding.",
        reload: true,
      };
    case "missing":
      return {
        message: "This change is no longer available. Check the review queue before deciding.",
        reload: true,
      };
    case "signed-out":
      return { message: "Your session has ended. Sign in again, then try again.", reload: false };
    case "invalid":
      return {
        message:
          outcome.errors
            .map((item) => `${pageFieldLabel(item.field)}: ${item.message}`)
            .join(" ") || "This change can't be published as it stands.",
        reload: false,
      };
    case "refused":
      return outcome.code === "review_state_conflict"
        ? {
            message:
              outcome.message ?? "This change is not in the state required for that decision.",
            reload: true,
          }
        : { message: `We could not ${decision} this change. Try again.`, reload: false };
    case "landed":
      return { message: "", reload: false };
  }
}

const MAX_COMMENT = 2000;

/**
 * One page's change against its live page. An approver publishes or rejects it at the version shown; anyone else
 * reads it only.
 */
export function ReviewScreen({
  api,
  pageId,
  selfApproval = false,
}: {
  api: EditorApi;
  pageId: string;
  /** Whether the API lets someone decide on their own change, as it does for one local developer under the auth bypass. */
  selfApproval?: boolean;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const revision = useQuery(revisionQuery(api, pageId));
  const approver = useQuery(rolesQuery(api)).data?.includes("approver") ?? false;
  const me = useQuery(employeeIdQuery(api)).data;

  const submitter = useQuery(reviewQueueQuery(api)).data?.find(
    (entry) => entry.page_id === pageId,
  )?.submitted_by_name;

  // The version the approver opened the decision on, so a change that moves underneath it is refused, not decided
  const [deciding, setDeciding] = useState<{
    decision: Decision;
    snapshot: ApiRevision;
  }>();

  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState("");
  const commentField = useRef<HTMLTextAreaElement>(null);
  const [refusals, setRefusals] = useState(0);

  // Once the error shows, the focus goes to the field it describes, so a screen reader reads them together
  useEffect(() => {
    if (refusals) commentField.current?.focus();
  }, [refusals]);
  const [screenError, setScreenError] = useState("");

  const publish = useWrite(api, writes.publishRevision);
  const reject = useWrite(api, writes.rejectRevision);
  const decide = deciding?.decision === "reject" ? reject : publish;
  const pending = decide.state === "sending" || decide.state === "checking";
  // Only presentation history: a refusal after uncertainty must not claim nothing was decided.
  const unanswered = useRef(false);

  const protectingDecision =
    pending ||
    publish.state === "unsettled" ||
    reject.state === "unsettled" ||
    publish.outcome?.kind === "landed" ||
    reject.outcome?.kind === "landed";

  const decided = useEffectEvent(async (result: Outcome<unknown>, decision: Decision) => {
    if (result.kind === "landed") {
      toast(decision === "publish" ? "Change published" : "Change rejected", {
        description:
          decision === "publish"
            ? "Citizens now see it on the live page."
            : "The editor sees your comment with the change.",
      });
      setDeciding(undefined);
      // Off the queue before it shows, and not read again by this screen as it goes
      client.setQueryData(reviewQueueQuery(api).queryKey, (queue) =>
        queue?.filter((entry) => entry.page_id !== pageId),
      );
      client.removeQueries({ queryKey: revisionQuery(api, pageId).queryKey, exact: true });
      await navigate({ to: "/reviews" });
      document.getElementById("workspace-content")?.focus();
      void client.invalidateQueries({ queryKey: ["content"] });

      return;
    }

    const afterUnknown = unanswered.current;

    if (result.kind === "unknown") unanswered.current = true;
    const refused = refusal(result, decision, afterUnknown);

    if (!refused.reload) return;
    // Closed, so nothing is decided on a version the approver hasn't seen
    setDeciding(undefined);
    setScreenError(refused.message);
    void client.invalidateQueries({ queryKey: ["content"] });

    if (result.kind === "forbidden") void client.invalidateQueries({ queryKey: ["me"] });
  });

  useLayoutEffect(() => {
    if (publish.outcome) void decided(publish.outcome, "publish");
  }, [publish.outcome]);

  useLayoutEffect(() => {
    if (reject.outcome) void decided(reject.outcome, "reject");
  }, [reject.outcome]);

  // What the publish dialog says about the change's links: looked up again each time it opens, and until that
  // settles it can't be confirmed. A page list that couldn't be read says so; it never counts as clear.
  const [linkCheck, setLinkCheck] = useState<
    { status: "checking" } | { status: "done"; note?: string }
  >();

  const checkLinks = async (body: string, url: string) => {
    setLinkCheck({ status: "checking" });
    const links = linksInMarkdown(body, url);
    let note: string | undefined;

    if (!links) note = linkConfirmation([], true)?.message;
    else if (links.length)
      try {
        const listed = await client.fetchQuery({
          ...pageLinkTargetsQuery(api),
          staleTime: 0,
        });

        note = linkConfirmation(brokenLinks(links, listed, url), false)?.message;
      } catch {
        note = linkConfirmation([], true)?.message;
      }

    setLinkCheck({ status: "done", note });
  };

  const gone = useRef<HTMLDivElement>(null);
  const missing = revision.error instanceof ApiFailure && revision.error.status === 404;
  // A failed read keeps the last data, so with it the change was on screen and has gone since
  const vanished = missing && !!revision.data && !protectingDecision;

  useEffect(() => {
    if (!vanished) return;

    // Decided elsewhere while open: say so, rather than drop the dialog and the comment in it unexplained
    if (deciding && !decide.outcome)
      setScreenError(
        "Another approver published or rejected this change while you were reviewing it.",
      );
    setDeciding(undefined);
    // Its controls have gone, so the focus goes to what says why
    gone.current?.focus();
  }, [vanished]);

  const open = (decision: Decision) => {
    if (!revision.data || pending) return;
    publish.forget();
    reject.forget();
    setScreenError("");
    unanswered.current = false;
    setCommentError("");
    setDeciding({
      decision,
      snapshot: structuredClone(revision.data),
    });

    if (decision === "publish")
      void checkLinks(revision.data.fields.body_markdown, revision.data.fields.url);
  };

  const sendDecision = () => {
    if (!deciding || pending) return;

    if (deciding.decision === "publish") void publish.press(() => deciding.snapshot);
    else void reject.press(() => ({ reviewed: deciding.snapshot, comment: comment.trim() }));
  };

  const close = () => {
    if (pending) return;
    publish.forget();
    reject.forget();
    setDeciding(undefined);
  };

  const refused =
    decide.outcome && deciding
      ? refusal(decide.outcome, deciding.decision, unanswered.current)
      : undefined;

  const dialogError = refused && !refused.reload ? refused.message : undefined;
  const resending = decide.outcome?.kind === "unknown";

  const back = (
    <TextLink render={<Link to="/reviews" />} className="text-14">
      Back to the review queue
    </TextLink>
  );

  if (missing && !protectingDecision)
    return (
      <div ref={gone} tabIndex={-1} className="outline-none">
        {screenError && <Banner tone="error">{screenError}</Banner>}
        <EmptyState
          kind="not-found"
          title="Nothing is waiting for review on this page"
          description="It may have been published or rejected, or discarded when the page was taken out of public view."
          actions={back}
        />
      </div>
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

  const change = deciding?.snapshot ?? revision.data;
  const status = STATUS[change.status];

  // The API refuses anyone who worked on the change, unless it allows self-approval
  const own =
    !selfApproval && !!me && (change.submitted_by === me || change.contributors.includes(me));

  const decidable = approver && !own && change.status === "submitted";

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
        change.status === "submitted" && (
          <p className="text-14 text-muted">
            {approver
              ? "You worked on this change, so another approver must publish or reject it."
              : "An approver will publish or reject this change."}
          </p>
        )
      )}
      <ConfirmDialog
        open={deciding?.decision === "publish"}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Publish this change?"
        description={
          <>
            Citizens will see it at {change.fields.url} straight away.
            {linkCheck?.status === "checking" && " Checking its links…"}
            {linkCheck?.status === "done" && linkCheck.note && ` ${linkCheck.note}`}
          </>
        }
        confirmDisabled={linkCheck?.status !== "done"}
        confirmLabel="Approve and publish"
        pendingLabel="Publishing…"
        pending={pending}
        variant="accent"
        error={dialogError}
        onConfirm={sendDecision}
      />
      <FormDialog
        open={deciding?.decision === "reject"}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Reject this change"
        description="The live page stays as it is. The editor sees your comment with their change."
        pending={pending}
        onSubmit={() => {
          if (resending) return sendDecision();
          const trimmed = comment.trim();

          const problem = !trimmed
            ? "Enter why you're rejecting this change"
            : trimmed.length > MAX_COMMENT
              ? `Use ${MAX_COMMENT} characters or fewer`
              : "";

          setCommentError(problem);

          if (problem) return setRefusals((count) => count + 1);

          sendDecision();
        }}
        actions={
          <Button
            size="md"
            type="submit"
            variant="danger"
            pending={pending}
            pendingLabel="Rejecting…"
          >
            Reject change
          </Button>
        }
      >
        <Field
          label="Why are you rejecting it?"
          hint={
            resending
              ? "Trying again sends this comment as you first sent it."
              : "Say what the editor needs to change."
          }
          error={commentError}
        >
          <Textarea
            ref={commentField}
            rows={5}
            readOnly={pending || resending}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </Field>
        {dialogError && <Banner tone="error">{dialogError}</Banner>}
      </FormDialog>
    </>
  );
}
