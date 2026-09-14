import { Collapsible } from "../collapsible";
import { Banner } from "../banner";
import { Button } from "../button";
import { useEffect, useState } from "react";
import { ArrowDown01Icon } from "hugeicons-react";
import { redactAiData } from "@govtech-bb/form-builder";
import { CodeBlock } from "./code-block";
import { LoadingState } from "./loading-state";

export type PreparedChange = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warnings: string[];
  createPage?: boolean;
  apply: () => void | Promise<void>;
  appliedMessage?: string;
  external?: boolean;
};
export type Proposal = {
  summary: string;
  operation?: "update" | "create";
  recipe?: unknown;
  patch?: unknown;
  target?: { serviceId: string; pagePath?: string };
};

export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

export function ChangeDiff({
  change,
  showWarnings = true,
}: {
  change: Omit<PreparedChange, "apply">;
  showWarnings?: boolean;
}) {
  const fields = changedFields(change.before, change.after);
  return (
    <>
      {fields.length === 0 ? (
        <p className="text-[12px] text-ui-subtle">
          This proposal makes no changes.
        </p>
      ) : (
        <p className="text-[12px] leading-5 text-ui-subtle">
          {fields.length}{" "}
          {fields.length === 1 ? "section changes" : "sections change"}:{" "}
          {fields.join(", ")}
        </p>
      )}
      {showWarnings && <ChangeWarnings warnings={change.warnings} />}
      {fields.map((field) => (
        <Collapsible
          key={field}
          className="[&>[data-panel-open]>svg:last-child]:rotate-180"
        >
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-8 w-full justify-start gap-2 whitespace-normal px-0 text-left text-[12px]"
              />
            }
          >
            {field}
            <ArrowDown01Icon
              size={13}
              aria-hidden="true"
              className="ms-auto shrink-0 transition-transform duration-(--ui-fast) motion-reduce:transition-none"
            />
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <CodeBlock
              filename={field}
              before={displayValue(change.before[field])}
              code={displayValue(change.after[field])}
            />
          </Collapsible.Panel>
        </Collapsible>
      ))}
    </>
  );
}

export function ReviewCard({
  proposal,
  stale,
  disabled,
  prepare,
  onApprove,
  onReject,
  onViewChanges,
}: {
  proposal: Proposal;
  stale: boolean;
  disabled: boolean;
  prepare: () => Promise<PreparedChange>;
  onApprove: (change: PreparedChange) => void;
  onReject: () => void;
  onViewChanges?: () => void;
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
    <section
      className="my-3 min-w-0 overflow-hidden rounded-xl border border-ui-hairline bg-ui-base text-[13px] leading-5"
      aria-label="Review proposed changes"
    >
      <div className="space-y-3 p-3.5">
        <p className="text-[11px] font-medium text-ui-subtle">
          Proposed changes
        </p>
        <p className="text-pretty text-ui-default">{proposal.summary}</p>
        {stale ? (
          <p role="status" className="text-ui-subtle">
            The draft changed or this conversation was restored. Ask for a new
            proposal against the current draft.
          </p>
        ) : error ? (
          <div className="space-y-2">
            <p role="alert" className="text-ui-danger">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry validation
            </Button>
          </div>
        ) : !change ? (
          <LoadingState label="Checking the proposed draft…" timer={false} />
        ) : (
          <>
            <ChangeWarnings warnings={change.warnings} />
            {fields.length === 0 ? (
              <p className="text-[12px] text-ui-subtle">
                This proposal makes no changes.
              </p>
            ) : onViewChanges ? (
              <Button
                variant="ghost"
                size="sm"
                className="px-0"
                onClick={onViewChanges}
              >
                View changes · {fields.length}{" "}
                {fields.length === 1 ? "section" : "sections"}
              </Button>
            ) : (
              <Collapsible className="[&>[data-panel-open]>svg:last-child]:rotate-180">
                <Collapsible.Trigger
                  render={
                    <Button variant="ghost" size="sm" className="gap-2 px-0" />
                  }
                >
                  View changes · {fields.length}{" "}
                  {fields.length === 1 ? "section" : "sections"}
                  <ArrowDown01Icon
                    size={13}
                    aria-hidden="true"
                    className="transition-transform duration-(--ui-fast) motion-reduce:transition-none"
                  />
                </Collapsible.Trigger>
                <Collapsible.Panel>
                  <div className="space-y-2 pt-2">
                    <ChangeDiff change={change} showWarnings={false} />
                  </div>
                </Collapsible.Panel>
              </Collapsible>
            )}
            <p className="text-[12px] text-ui-subtle">
              {change.createPage
                ? "Creates a separate page draft and keeps your current page. Deploy each page when ready."
                : "Applies to this draft. Save or deploy when you are ready."}
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-ui-hairline px-3 py-2.5">
        <Button
          type="button"
          disabled={disabled}
          onClick={onReject}
          variant="ghost"
          size="sm"
        >
          Reject
        </Button>
        <Button
          type="button"
          disabled={disabled || stale || !change || fields.length === 0}
          onClick={() => change && onApprove(change)}
          variant="primary"
          size="sm"
        >
          {change?.createPage
            ? "Create page draft"
            : change?.warnings.length
              ? "Apply with warnings"
              : "Apply to draft"}
        </Button>
      </div>
    </section>
  );
}

function ChangeWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <Banner variant="alert" size="sm" className="text-[12px]">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">Needs repair before saving or deploying</p>
        <ul className="space-y-1">
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      </div>
    </Banner>
  );
}

function displayValue(value: unknown) {
  return typeof value === "string"
    ? value
    : (JSON.stringify(redactAiData(value), null, 2) ?? "");
}
