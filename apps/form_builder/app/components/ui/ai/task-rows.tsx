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
        <details className={s.task} key={row.id}>
          <summary>
            <span
              className={s.taskBadge}
              data-state={row.status}
              aria-hidden="true"
            >
              {row.status === "done" ? (
                <CheckmarkCircle02Icon size={21} />
              ) : row.status === "error" ? (
                <AlertCircleIcon size={21} />
              ) : (
                <>
                  <span
                    className={
                      row.status === "running" ? s.spinnerRing : s.pendingRing
                    }
                  />
                  {i + 1}
                </>
              )}
            </span>
            <span className={s.taskLabel}>{row.label}</span>
            <span className={s.taskStatus} data-state={row.status}>
              {
                {
                  pending: "Waiting",
                  running: "In progress",
                  done: "Completed",
                  error: "Failed",
                  stopped: "Paused",
                }[row.status]
              }
            </span>
            <ArrowDown01Icon size={13} aria-hidden="true" />
          </summary>
          <div className={s.taskDetail}>
            <p>{row.detail}</p>
            {row.onRetry && (
              <button type="button" onClick={row.onRetry}>
                Retry {row.label.toLowerCase()}
              </button>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
