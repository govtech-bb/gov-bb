import { setDOMUnmanaged } from "lexical";
import caretUp from "@phosphor-icons/core/assets/fill/caret-up-fill.svg?raw";
import caretDown from "@phosphor-icons/core/assets/fill/caret-down-fill.svg?raw";
import { $static, icon } from "../../../editor/react/block-dom";
import { frame } from "../../editor/answer-dom";
import { cn } from "../../../cn";
import { previewBox, previewWidth } from "../shared/presentation";
import type { FieldPreviewProps } from "../../editor/field-module";

export function $drawNumber() {
  const box = $static(
    "div",
    `relative flex h-(--form-control) w-full cursor-default items-center justify-end gap-2 pl-3 max-w-44 ${frame}`,
    { "data-drawn": "" },
  );

  setDOMUnmanaged(box, { captureSelection: true });

  const stepper = $static(
    "span",
    "flex w-10 shrink-0 flex-col self-stretch border-l-2 border-ink bg-grey-10 [&>span]:flex [&>span]:flex-1 [&>span]:items-center [&>span]:justify-center",
  );

  stepper.innerHTML = `<span>${icon(caretUp, 12)}</span><span class="border-t-2 border-ink">${icon(caretDown, 12)}</span>`;
  box.append(stepper);

  return box;
}

export function NumberPreview({ width }: FieldPreviewProps) {
  return <div className={cn(previewBox, "max-w-36", previewWidth(width))} />;
}
