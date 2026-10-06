import { cn } from "../../../cn";
import { setDOMUnmanaged } from "lexical";
import { $static } from "../../../editor/react/block-dom";
import { frame } from "../../editor/answer-dom";
import type { FieldPreviewProps } from "../../editor/field-module";

export function LongAnswerPreview({ width }: FieldPreviewProps) {
  return (
    <div
      className={cn(
        "rounded-sm border-2 border-ink bg-white h-24",
        width === "short" ? "max-w-[24ch]" : width === "medium" ? "max-w-[38ch]" : undefined,
      )}
    />
  );
}

export function $drawLongAnswer() {
  const box = $static(
    "div",
    `relative flex min-h-26 w-full max-w-[var(--field-width,100%)] cursor-default p-3 ${frame}`,
    { "data-drawn": "" },
  );

  setDOMUnmanaged(box, { captureSelection: true });

  return box;
}
