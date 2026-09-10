import { Collapsible } from "../../../component/ui/collapsible";
import { Button } from "../../../component/ui/button";
import { useState, type ReactNode } from "react";
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
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? working;
  return (
    <Collapsible className={s.thinking} open={open} onOpenChange={setExpanded}>
      <Collapsible.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-start whitespace-normal text-left"
          />
        }
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
      </Collapsible.Trigger>
      <Collapsible.Panel className={s.trace}>{children}</Collapsible.Panel>
    </Collapsible>
  );
}
