import { Loader } from "../../../component/ui/loader";
import { Elevated } from "../../../component/ui/surface";
import { Badge } from "../../../component/ui/badge";
import { Collapsible } from "../../../component/ui/collapsible";
import { Button } from "../../../component/ui/button";
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "hugeicons-react";
import s from "./components.module.css";

export type TaskRow = {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error" | "stopped";
  detail: string;
  onRetry?: () => void;
};

export function TaskRows({ rows }: { rows: TaskRow[] }) {
  return (
    <div className={s.tasks}>
      {rows.map((row, i) => (
        <Collapsible
          className={s.task}
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
              className={s.taskBadge}
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
                  <span className={s.pendingRing} />
                  {i + 1}
                </>
              )}
            </span>
            <span className={s.taskLabel}>{row.label}</span>
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
            <div className={s.taskDetail}>
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
