import { UploadSimple } from "@phosphor-icons/react";
import { cn } from "../../../cn";
import { govbbOptional } from "../../../ui/govbb";
import type { Settings } from "../../core/settings";
import { onEdge, optionalRoom } from "../../editor/answer-dom";
import { fileExtensions, fileTypesOf } from "./files";

/** GovBB's subtitle, listing the formats this upload accepts. */
export const acceptedFiles = (types: string[]) => `Attach a ${fileExtensions(types)} file`;

export const maxFileSize = (s: Settings) =>
  s.hasMaxFileSize && typeof s.maxFileSize === "number" ? s.maxFileSize : undefined;

export function FileUpload({ settings }: { settings: Settings }) {
  const types = fileTypesOf(settings);
  const size = maxFileSize(settings);

  return (
    <div className={optionalRoom}>
      <div
        data-drawn=""
        className="relative mb-(--form-gap) flex flex-col items-center gap-3 rounded-sm border-2 border-dashed border-grey-60 px-4 py-6 text-center leading-[1.5]"
      >
        <span className="font-bold">Upload a file</span>
        {types.length > 0 && <span className="-mt-3 text-muted">{acceptedFiles(types)}</span>}
        <span className="inline-flex h-11 items-center gap-2 rounded-sm px-4 font-semibold text-green-80 shadow-[inset_0_0_0_2px_var(--color-green-80)] [&>svg]:size-5">
          <UploadSimple />
          Choose file
        </span>
        {size !== undefined && <span className="text-16 text-muted">Maximum size: {size}MB</span>}
        <span data-optional="" hidden aria-hidden="true" className={cn(onEdge, govbbOptional)}>
          (optional)
        </span>
      </div>
    </div>
  );
}
