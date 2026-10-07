import {
  AlertCircleIcon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
} from "hugeicons-react";
import { Badge } from "../badge";
import { Button } from "../button";
import { Collapsible } from "../collapsible";
import { Loader } from "../loader";
import { ChangeDiff, changedFields, type PreparedChange } from "./review";

export function AppliedCard({
  summary,
  state,
  change,
  message,
  onViewChanges,
}: {
  summary: string;
  state: "validating" | "applied" | "failed";
  change?: Omit<PreparedChange, "apply">;
  message?: string;
  onViewChanges?: () => void;
}) {
  const count = change ? changedFields(change.before, change.after).length : 0;
  const label =
    state === "validating"
      ? "Checking the proposed draft…"
      : state === "failed"
        ? "Not applied"
        : change?.createPage
          ? "Created page draft"
          : `Applied to draft${change ? ` · ${count} ${count === 1 ? "section" : "sections"} changed` : ""}`;
  return (
    <section className="my-3 min-w-0 text-[13px] leading-5">
      <Collapsible className="min-inline-0 [&>[data-panel-open]>svg:last-child]:rotate-180">
        <Collapsible.Trigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="group/row h-auto min-h-8 max-w-full justify-start gap-2 rounded-full bg-ui-recessed/60 px-2.5 py-1.5 text-left text-[12px] whitespace-normal"
            />
          }
        >
          <span
            aria-hidden="true"
            className={`shrink-0 ${state === "failed" ? "text-ui-danger" : state === "applied" ? "text-ui-success" : "text-ui-subtle"}`}
          >
            {state === "validating" ? (
              <Loader size={16} />
            ) : state === "failed" ? (
              <AlertCircleIcon size={16} />
            ) : (
              <CheckmarkCircle02Icon size={16} />
            )}
          </span>
          <span role="status">{label}</span>
          {!!change?.warnings.length && (
            <Badge variant="warning">
              {change.warnings.length}{" "}
              {change.warnings.length === 1 ? "warning" : "warnings"}
            </Badge>
          )}
          <ArrowDown01Icon
            size={13}
            aria-hidden="true"
            className="shrink-0 text-ui-subtle transition-[rotate,color] duration-(--ui-fast) ease-out group-hover/row:text-ui-default group-focus-visible/row:text-ui-default motion-reduce:transition-none"
          />
        </Collapsible.Trigger>
        <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-(--ui-fast) ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
          <div className="space-y-3 py-3 ps-2.5">
            {(state !== "failed" || message) && (
              <p className="text-pretty">{summary}</p>
            )}
            {change &&
              (onViewChanges ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0"
                  onClick={onViewChanges}
                >
                  View changes
                </Button>
              ) : (
                <ChangeDiff change={change} />
              ))}
            {message && state !== "failed" && (
              <p className="text-ui-subtle">{message}</p>
            )}
          </div>
        </Collapsible.Panel>
      </Collapsible>
      {state === "failed" && (
        <p role="alert" className="mt-2 text-ui-danger">
          {message || summary}
        </p>
      )}
    </section>
  );
}
