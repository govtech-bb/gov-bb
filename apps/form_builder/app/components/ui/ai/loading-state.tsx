import { useEffect, useState, type CSSProperties } from "react";
import s from "./components.module.css";

const orbit = [0, 1, 2, 5, 8, 7, 6, 3];

export function LoadingState({
  label = "Working",
  variant = "Drive",
  timer = true,
}: {
  label?: string;
  variant?: "Drive" | "Dots" | "Orbit";
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
    <span className={s.loading}>
      <span className={s.pixels} data-variant={variant} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => {
          const delay =
            variant === "Orbit"
              ? orbit.indexOf(index) * 110
              : ((index % 3) + Math.abs(Math.floor(index / 3) - 1)) * 90;
          return (
            <span
              key={index}
              style={
                {
                  "--delay": `${delay}ms`,
                  "--duration": variant === "Orbit" ? "950ms" : "650ms",
                } as CSSProperties
              }
              data-off={delay < 0}
            />
          );
        })}
      </span>
      <span className={s.loadingLabel} role="status">
        {label}
      </span>
      {timer && (
        <span className={s.elapsed} aria-hidden="true">
          {elapsed < 60
            ? `${elapsed.toFixed(1)}s`
            : `${Math.floor(elapsed / 60)}m ${Math.floor(elapsed % 60)}s`}
        </span>
      )}
    </span>
  );
}
