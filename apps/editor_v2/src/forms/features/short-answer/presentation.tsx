import { cn } from "../../../cn";
import type { FieldWidth } from "../../core/field-settings";

/** The insertion preview uses the same width and optional input mask as the answer. */
export function ShortAnswerPreview({ width, mask }: { width?: FieldWidth; mask?: string }) {
  const measure =
    width === "short" ? "max-w-[24ch]" : width === "medium" ? "max-w-[38ch]" : undefined;

  return (
    <div
      className={cn(
        "h-(--form-control) rounded-sm border-2 border-ink bg-white",
        "flex items-center justify-end px-3",
        measure,
      )}
    >
      {mask && <span className="font-mono text-12 text-muted">{mask}</span>}
    </div>
  );
}
