import { useEffect, useState } from "react";
import s from "./components.module.css";

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
    <span className={s.loading}>
      <Loader size={16} aria-hidden="true" />
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
