import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { tones, type BadgeTone } from "./badge";
import { Button } from "./button";

type Removal =
  | {
      /** Shows a button that removes it. */
      onRemove: () => void;
      /** Names that button for what it removes, such as “Remove Business and trade”. */
      removeLabel: string;
    }
  | { onRemove?: never; removeLabel?: never };

type TagProps = Removal & {
  /** Badge's tones; by default the blue of something chosen. */
  tone?: BadgeTone;
  /** For the chip, such as its height beside taller controls. */
  className?: string;
  children: ReactNode;
};

/**
 * Something chosen, such as a category or a filter, with a button to remove it. Long
 * words wrap rather than overflow. Badge is the same chip for a status, which can't be removed.
 */
export function Tag({ tone = "info", onRemove, removeLabel, className, children }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-sm ps-2.5 text-14",
        onRemove ? "pe-1" : "pe-2.5",
        tones[tone],
        className,
      )}
    >
      <span className="min-w-0 py-1.5 wrap-anywhere">{children}</span>
      {onRemove && <Button size="xs" icon={<X />} aria-label={removeLabel} onClick={onRemove} />}
    </span>
  );
}
