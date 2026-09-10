import { Loader } from "../loader";
import { Badge } from "../badge";
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
                className="h-auto min-h-9 w-full justify-start whitespace-normal text-left"
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
            <span className="wrap-anywhere">{step.label}</span>
            <Badge variant="secondary" className="ml-auto max-w-[55%] truncate">
              {step.chip}
            </Badge>
            <ArrowDown01Icon size={12} aria-hidden="true" />
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <div className="mt-1 mb-2.5 text-[12px] [&>p]:mb-1.5">
              <p>
                Status:{" "}
                {step.status === "waiting"
                  ? "Waiting for your response"
                  : step.status === "done"
                    ? "Complete"
                    : step.status === "stopped"
                      ? "Interrupted"
                      : step.status}
              </p>
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
