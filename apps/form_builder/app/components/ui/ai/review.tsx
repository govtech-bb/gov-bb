import { useEffect, useState } from "react";
import { redactAiData } from "@govtech-bb/form-builder";
import { CodeBlock } from "./code-block";
import { TaskRows } from "./task-rows";
import s from "./ai.module.css";

export type PreparedChange = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warnings: string[];
  apply: () => void;
};
export type Proposal = { summary: string; recipe?: unknown; patch?: unknown };

export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

export function ReviewCard({
  proposal,
  stale,
  disabled,
  prepare,
  onApprove,
  onReject,
}: {
  proposal: Proposal;
  stale: boolean;
  disabled: boolean;
  prepare: () => Promise<PreparedChange>;
  onApprove: (change: PreparedChange) => void;
  onReject: () => void;
}) {
  const [change, setChange] = useState<PreparedChange>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setChange(undefined);
    setError("");
    if (!stale)
      void prepare().then(
        (value) => {
          if (live) setChange(value);
        },
        (reason) => {
          if (live)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not validate this proposal.",
            );
        },
      );
    return () => {
      live = false;
    };
  }, [attempt, stale, prepare]);
  const fields = change ? changedFields(change.before, change.after) : [];
  return (
    <section className={s.review} aria-label="Review proposed changes">
      <div className={s.eyebrow}>Proposed changes</div>
      <p>{proposal.summary}</p>
      {!stale && (
        <TaskRows
          rows={[
            {
              id: "validation",
              label: "Check proposed draft",
              status: error ? "error" : change ? "done" : "running",
              detail:
                error ||
                (change
                  ? change.warnings.length
                    ? `${change.warnings.length} warnings to review before saving.`
                    : "The draft is ready for your review."
                  : "Checking the proposal against the current draft and editing rules."),
              ...(error
                ? { onRetry: () => setAttempt((value) => value + 1) }
                : {}),
            },
          ]}
        />
      )}
      {stale ? (
        <p role="status">
          The draft changed or this conversation was restored. Ask for a new
          proposal against the current draft.
        </p>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
        </>
      ) : !change ? (
        <p role="status">Checking the proposed draft…</p>
      ) : (
        <>
          {fields.length === 0 ? (
            <p>This proposal makes no changes.</p>
          ) : (
            <p>
              {fields.length}{" "}
              {fields.length === 1 ? "section changes" : "sections change"}:{" "}
              {fields.join(", ")}
            </p>
          )}
          {change.warnings.length > 0 && (
            <div className={s.warning}>
              <strong>Needs repair before saving or deploying</strong>
              <ul>
                {change.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          {fields.map((field) => (
            <details key={field}>
              <summary>{field}</summary>
              <CodeBlock
                filename={field}
                before={displayValue(change.before[field])}
                code={displayValue(change.after[field])}
              />
            </details>
          ))}
          <p className={s.muted}>
            Applies to this draft. Save or deploy when you are ready.
          </p>
        </>
      )}
      <div className={s.actions}>
        <button type="button" disabled={disabled} onClick={onReject}>
          Reject
        </button>
        <button
          type="button"
          className={s.primary}
          disabled={disabled || stale || !change || fields.length === 0}
          onClick={() => change && onApprove(change)}
        >
          {change?.warnings.length ? "Apply with warnings" : "Apply to draft"}
        </button>
      </div>
    </section>
  );
}

function displayValue(value: unknown) {
  return typeof value === "string"
    ? value
    : (JSON.stringify(redactAiData(value), null, 2) ?? "");
}
