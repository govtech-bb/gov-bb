import { Warning } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cn } from "../cn";

// Yellow can't be read as text, so a warning keeps the ink and leads with GovBB's warning sign, as a Banner does
const tones = {
  muted: "text-muted",
  error: "text-error",
  warning: "flex gap-1 text-ink [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0",
};

export type NoteTone = keyof typeof tones;

/**
 * A line or two of 12px small print that stands alone, such as what a setting is for or why a page is out of place.
 * A note on one field belongs to the field, as its hint or its error.
 */
export function Note({
  tone = "muted",
  className,
  children,
  ...props
}: ComponentProps<"p"> & { tone?: NoteTone }) {
  return (
    <p {...props} className={cn("text-12 leading-4 text-pretty", tones[tone], className)}>
      {tone === "warning" && <Warning aria-hidden="true" />}
      {children}
    </p>
  );
}
