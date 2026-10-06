import { MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "../../../cn";
import type { FieldPreviewProps } from "../../editor/field-module";
import { previewBox, previewWidth } from "../shared/presentation";

export function AddressLookupPreview({ width }: FieldPreviewProps) {
  return (
    <div className={cn(previewBox, "flex items-center justify-end px-3", previewWidth(width))}>
      <MagnifyingGlass className="size-5 text-muted" />
    </div>
  );
}
