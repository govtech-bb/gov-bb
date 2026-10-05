import { cn } from "../../../cn";
import type { FieldPreviewProps } from "../../editor/field-module";
import { previewControl } from "../shared/presentation";

export function MultipleChoicePreview({ options = ["Yes", "No"] }: FieldPreviewProps) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => (
        <div key={option} className="flex items-center gap-3 leading-[1.5]">
          <span className={cn("size-(--form-marker) shrink-0", previewControl, "rounded-full")} />
          {option}
        </div>
      ))}
    </div>
  );
}
