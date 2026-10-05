import { cn } from "../../../cn";
import { previewBox, previewWidth } from "../shared/presentation";
import type { FieldPreviewProps } from "../../editor/field-module";

export function TimePreview({ width }: FieldPreviewProps) {
  return <div className={cn(previewBox, "max-w-36", previewWidth(width))} />;
}
