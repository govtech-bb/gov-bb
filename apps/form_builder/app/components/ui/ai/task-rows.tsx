import { Loader } from "../loader";
import { Elevated } from "../surface";
import { Badge } from "../badge";
import { Collapsible } from "../collapsible";
import { Button } from "../button";
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "hugeicons-react";

export type TaskRow = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "stopped";
  detail: string;
  onRetry?: () => void;
};

export function TaskRows({ rows }: { rows: TaskRow[] }) {
  return (
    <div className="my-3 grid gap-2">
      {rows.map((row, i) => (
        <Collapsible
          className="overflow-hidden rounded-3xl transition-[border-radius] duration-(--ui-moderate) has-[[data-panel-open]]:rounded-xl motion-reduce:transition-none [&>[data-panel-open]>svg:last-child]:rotate-180"
          key={row.id}
          render={<Elevated offset={1} shadowLevel={2} />}
        >
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-11 w-full justify-start gap-2.5 rounded-[inherit] px-2.5 py-2 text-left whitespace-normal"
              />
            }
          >
            <span
              className="relative grid block-6 inline-6 shrink-0 place-items-center text-[10px] tabular-nums data-[state=done]:text-ui-success data-[state=error]:text-ui-danger"
              data-state={row.status}
              aria-hidden="true"
            >
              {row.status === "done" ? (
                <CheckmarkCircle02Icon size={21} />
              ) : row.status === "error" ? (
                <AlertCircleIcon size={21} />
              ) : row.status === "running" ? (
                <>
                  <span className="absolute inset-0">
                    <Loader size={24} />
                  </span>
                  <span>{i + 1}</span>
                </>
              ) : (
                <>
                  <span className="absolute inset-0 rounded-full border-[1.5px] border-ui-line" />
                  {i + 1}
                </>
              )}
            </span>
            <span className="min-inline-0 flex-1 text-[13px] font-medium wrap-anywhere">
              {row.label}
            </span>
            <Badge
              className="shrink-0 rounded-full text-[11px]"
              variant={
                row.status === "error"
                  ? "destructive"
                  : row.status === "done"
                    ? "success"
                    : "secondary"
              }
            >
              {
                {
                  pending: "Waiting",
                  running: "In progress",
                  done: "Completed",
                  error: "Failed",
                  stopped: "Paused",
                }[row.status]
              }
            </Badge>
            <ArrowDown01Icon
              size={13}
              aria-hidden="true"
              className="shrink-0 text-ui-subtle transition-[rotate] duration-(--ui-moderate) motion-reduce:transition-none"
            />
          </Collapsible.Trigger>
          <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-(--ui-moderate) ease-(--ui-ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
            <div className="me-3 mb-3 ms-5.5 border-s border-ui-hairline ps-5 text-[12px] leading-relaxed text-ui-subtle [&>p]:mb-1.5">
              <p>{row.detail}</p>
              {row.onRetry && (
                <Button
                  type="button"
                  onClick={row.onRetry}
                  variant="ghost"
                  size="sm"
                >
                  Retry {row.label.toLowerCase()}
                </Button>
              )}
            </div>
          </Collapsible.Panel>
        </Collapsible>
      ))}
    </div>
  );
}
