import { cn } from "../../../cn";
import type { FieldPreviewProps } from "../../editor/field-module";

export const previewControl = "rounded-sm border-2 border-ink bg-white";

export const previewBox = `h-(--form-control) ${previewControl}`;

export const previewWidth = (width?: FieldPreviewProps["width"]) =>
  width === "short" ? "max-w-[24ch]" : width === "medium" ? "max-w-[38ch]" : undefined;

export function WrittenInputPreview({ width, mask }: FieldPreviewProps) {
  return (
    <div className={cn(previewBox, "flex items-center justify-end px-3", previewWidth(width))}>
      {mask && <span className="font-mono text-12 text-muted">{mask}</span>}
    </div>
  );
}
