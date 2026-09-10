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
      className="my-2.5 min-inline-0"
      open={open}
      onOpenChange={setExpanded}
    >
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
          className="shrink-0 transition-[rotate] duration-180 ease-[ease] data-[open=true]:rotate-180 motion-reduce:transition-none"
          data-open={open}
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-1.5 mb-0 ml-1.5 border-s border-ui-line ps-2.5">
        {children}
      </Collapsible.Panel>
    </Collapsible>
  );
}
