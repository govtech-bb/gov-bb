import { cn } from "../../../cn";
import type { FieldPreviewProps } from "../../editor/field-module";
import { previewBox, previewWidth } from "../shared/presentation";
import { CaretDown } from "@phosphor-icons/react";

export function DropdownPreview({ options = ["Yes", "No"], width, more = 0 }: FieldPreviewProps) {
  return (
    <>
      <div className={cn(previewBox, "flex max-w-80 justify-end", previewWidth(width))}>
        <span className="flex w-10 items-center justify-center border-l-2 border-ink bg-grey-10 [&>svg]:size-3.5">
          <CaretDown weight="fill" />
        </span>
      </div>
      <div
        className={cn(
          "mt-2 flex max-w-80 flex-col gap-1 border-l-4 border-line pl-4 leading-[1.5]",
          previewWidth(width),
        )}
      >
        {options.map((option) => (
          <span key={option}>{option}</span>
        ))}
        {more > 0 && <span className="text-muted">and {more} more</span>}
      </div>
    </>
  );
}
