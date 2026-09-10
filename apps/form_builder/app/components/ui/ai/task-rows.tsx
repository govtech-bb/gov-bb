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
    <div className="my-2.5 grid gap-1.75">
      {rows.map((row, i) => (
        <Collapsible
          className="overflow-hidden rounded-[20px] open:rounded-xl [&>[data-panel-open]>svg:last-child]:rotate-180"
          key={row.id}
          render={<Elevated offset={1} shadowLevel={2} />}
        >
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
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
                <Loader size={18} />
              ) : (
                <>
                  <span className="absolute inset-0 rounded-full border-[1.5px] border-ui-line" />
                  {i + 1}
                </>
              )}
            </span>
            <span className="min-inline-0 flex-1 text-[12px] font-medium wrap-anywhere">
              {row.label}
            </span>
            <Badge
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
            <ArrowDown01Icon size={13} aria-hidden="true" />
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <div className="mt-0 mr-3 mb-2.5 ml-5.5 border-s border-ui-hairline ps-5 text-[12px] text-ui-default [&>p]:mb-1.25">
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
