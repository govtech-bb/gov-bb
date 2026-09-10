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
import s from "./components.module.css";

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
    <div className={s.toolChips}>
      {steps.map((step) => (
        <Collapsible key={step.id} className={s.toolRow}>
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
              className={s.toolIcon}
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
                <span className={s.waitDot} />
              )}
            </span>
            <span className={s.toolLabel}>{step.label}</span>
            <Badge variant="secondary" className="ml-auto max-w-[55%] truncate">
              {step.chip}
            </Badge>
            <ArrowDown01Icon size={12} aria-hidden="true" />
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <div className={s.toolDetail}>
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
