import { useEffect, useState } from "react";

import { Loader } from "../loader";

export function LoadingState({
  label = "Working",
  timer = true,
}: {
  label?: string;
  timer?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!timer) return;
    const start = performance.now();
    const interval = setInterval(
      () => setElapsed((performance.now() - start) / 1000),
      100,
    );
    return () => clearInterval(interval);
  }, [timer]);
  return (
    <span className="inline-flex min-inline-0 items-center gap-2.25 text-[13px] text-ui-default">
      <Loader size={16} aria-hidden="true" />
      <span className="font-medium text-ui-default" role="status">
        {label}
      </span>
      {timer && (
        <span
          className="font-mono text-[11px] whitespace-nowrap tabular-nums"
          aria-hidden="true"
        >
          {elapsed < 60
            ? `${elapsed.toFixed(1)}s`
            : `${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`}
        </span>
      )}
    </span>
  );
}
