import { Info } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import { Button } from "../button";
import { Tooltip } from "../tooltip";

export function labelVariants() {
  return cn(
    // Base styles - when used standalone, apply text styling
    // When used inside Field, the parent FieldBase.Label provides these styles
    "m-0 text-base font-medium text-ui-default",
  );
}
export function labelContentVariants() {
  return cn(
    // Content wrapper styles - always applied
    "inline-flex items-center gap-1",
  );
}
export interface LabelProps {
  /** The label content — can be a string or any React node. */
  children: ReactNode;
  /** When `true`, shows gray "(optional)" text after the label. */
  showOptional?: boolean;
  /** Tooltip content displayed next to the label via an info icon. */
  tooltip?: ReactNode;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** The id of the form element this label is associated with */
  htmlFor?: string;
  asContent?: boolean;
}
export function Label({
  children,
  showOptional = false,
  tooltip,
  className,
  htmlFor,
  asContent = false,
}: LabelProps) {
  const content = (
    <>
      {children}
      {showOptional && (
        <span className="font-normal text-ui-subtle">(optional)</span>
      )}
      {tooltip && (
        <Tooltip
          content={tooltip}
          render={
            <Button
              variant="ghost"
              size="xs"
              shape="square"
              aria-label="More information"
            >
              <Info className="size-4" />
            </Button>
          }
        />
      )}
    </>
  );
  // When used as content inside another styled element, just render inline
  if (asContent) {
    return (
      <span className={cn(labelContentVariants(), className)}>{content}</span>
    );
  }
  // When used standalone, render as <label> for accessibility
  return (
    <label
      htmlFor={htmlFor}
      className={cn(labelVariants(), labelContentVariants(), className)}
    >
      {content}
    </label>
  );
}
Label.displayName = "Label";
