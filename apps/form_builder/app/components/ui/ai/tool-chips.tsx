import { Loader } from "../loader";
import { Button } from "../button";
import { Collapsible } from "../collapsible";
import { redactAiData } from "@govtech-bb/form-builder";
import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "hugeicons-react";
import { CodeBlock } from "./code-block";

export type ToolStep = {
  id: string;
  label: string;
  chip: string;
  status: "running" | "waiting" | "done" | "error" | "stopped";
  input?: unknown;
  output?: unknown;
};

export function ToolChips({ steps }: { steps: ToolStep[] }) {
  return (
    <div className="grid gap-1">
      {steps.map((step) => (
        <Collapsible
          key={step.id}
          className="min-inline-0 [&>[data-panel-open]>svg:last-child]:rotate-180"
        >
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="group/row h-auto min-h-7 w-full justify-start gap-2 px-0.5 py-0.5 text-left text-[12px] whitespace-normal"
              />
            }
          >
            <span
              className="grid inline-4 shrink-0 place-items-center text-ui-default data-[state=error]:text-ui-danger"
              data-state={step.status}
              aria-hidden="true"
            >
              {step.status === "done" ? (
                <CheckmarkCircle02Icon size={15} />
              ) : step.status === "error" ? (
                <AlertCircleIcon size={15} />
              ) : step.status === "running" ? (
                <Loader size={14} />
              ) : (
                <span className="block-1.25 inline-1.25 rounded-full bg-ui-subtle" />
              )}
            </span>
            <span className="min-inline-0 shrink-0 max-w-[55%] wrap-anywhere">
              {step.label}
            </span>
            <span className="min-inline-0 truncate rounded-md bg-ui-tint px-1.5 py-0.5 text-[11px] font-normal text-ui-subtle">
              {step.chip}
            </span>
            <span className="sr-only">
              {step.status === "waiting"
                ? "Waiting for your response"
                : step.status === "done"
                  ? "Complete"
                  : step.status === "stopped"
                    ? "Interrupted"
                    : step.status}
            </span>
            <ArrowDown01Icon
              size={12}
              aria-hidden="true"
              className="ms-auto shrink-0 text-ui-subtle transition-[rotate,color] duration-(--ui-fast) ease-(--ui-ease) group-hover/row:text-ui-default group-focus-visible/row:text-ui-default motion-reduce:transition-none"
            />
          </Collapsible.Trigger>
          <Collapsible.Panel className="h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-(--ui-moderate) ease-(--ui-ease) data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none [&[hidden]:not([hidden='until-found'])]:hidden">
            <div className="mt-1 mb-2.5 ms-2 border-s border-ui-hairline ps-3.5 text-[12px]">
              {step.input !== undefined && (
                <CodeBlock
                  filename="Tool input"
                  code={JSON.stringify(redactAiData(step.input), null, 2)}
                />
              )}
              {step.output !== undefined && (
                <CodeBlock
                  filename="Tool result"
                  code={JSON.stringify(redactAiData(step.output), null, 2)}
                />
              )}
            </div>
          </Collapsible.Panel>
        </Collapsible>
      ))}
    </div>
  );
}
