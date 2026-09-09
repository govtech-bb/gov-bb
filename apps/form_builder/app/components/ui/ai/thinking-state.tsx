import { useId, useState, type ReactNode } from "react";
import { ArrowDown01Icon, AiMagicIcon } from "hugeicons-react";
import { LoadingState } from "./loading-state";
import s from "./components.module.css";

/** Displays observable activity; content and completion come from the run. */
export function ThinkingState({
  working,
  active = "Working on your draft",
  done,
  children,
}: {
  working: boolean;
  active?: string;
  done: string;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? working;
  return (
    <div className={s.thinking}>
      <button
        type="button"
        className={s.traceToggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setExpanded(!open)}
      >
        {working ? (
          <LoadingState label={active} />
        ) : (
          <>
            <AiMagicIcon size={15} aria-hidden="true" />
            <span>{done}</span>
          </>
        )}
        <ArrowDown01Icon
          size={13}
          className={s.chevron}
          data-open={open}
          aria-hidden="true"
        />
      </button>
      <div id={id} className={s.trace} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
