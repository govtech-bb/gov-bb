import { useEffect, useState } from "react";

export function LoadingState({
  label = "Working",
  timer = false,
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
    <span className="inline-flex min-inline-0 items-center gap-2.5 text-[13px] text-ui-subtle">
      <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-px">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="size-1 rounded-[1px] bg-current opacity-40 motion-safe:animate-pulse"
            style={{
              animationDelay: `${((i % 3) + Math.abs(Math.floor(i / 3) - 1)) * 120}ms`,
              animationDuration: "960ms",
            }}
          />
        ))}
      </span>
      <span className="font-medium" role="status">
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
