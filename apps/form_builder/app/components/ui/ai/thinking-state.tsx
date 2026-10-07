import { Collapsible } from "../collapsible";
import { Button } from "../button";
import { useState, type ReactNode } from "react";
import { ArrowDown01Icon, AiMagicIcon } from "hugeicons-react";
import { LoadingState } from "./loading-state";

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
    <Collapsible
      className="my-3 min-inline-0"
      open={open}
      onOpenChange={setExpanded}
    >
      <Collapsible.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="-ms-1.5 h-auto min-h-7 max-w-full justify-start gap-1.5 px-1.5 py-1 text-left text-[12px] whitespace-normal"
          />
        }
      >
        {working ? (
          <LoadingState label={active} timer />
        ) : (
          <>
            <AiMagicIcon size={15} aria-hidden="true" />

            <span>{done}</span>
          </>
        )}
        <ArrowDown01Icon
          size={13}
          className="shrink-0 transition-[rotate] duration-(--ui-moderate) ease-(--ui-ease) data-[open=true]:rotate-180 motion-reduce:transition-none"
          data-open={open}
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-1 h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-(--ui-moderate) ease-(--ui-ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
        {children}
      </Collapsible.Panel>
    </Collapsible>
  );
}
