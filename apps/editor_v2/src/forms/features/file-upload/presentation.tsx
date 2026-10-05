import { UploadSimple } from "@phosphor-icons/react";
import type { Settings } from "../../core/settings";
import { fileExtensions, fileTypesOf } from "./files";

/** GovBB's subtitle, listing the formats this upload accepts. */
export const acceptedFiles = (types: string[]) => `Attach a ${fileExtensions(types)} file`;

export const maxFileSize = (s: Settings) =>
  s.hasMaxFileSize && typeof s.maxFileSize === "number" ? s.maxFileSize : undefined;

export function FileUpload({ settings }: { settings: Settings }) {
  const types = fileTypesOf(settings);
  const size = maxFileSize(settings);

  return (
    <div className="has-[[data-optional]:not([hidden])]:pt-7">
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
        <span
          data-optional=""
          hidden
          aria-hidden="true"
          className="absolute -top-7 right-0 text-16 leading-6 font-normal whitespace-nowrap text-muted select-none"
        >
          (optional)
        </span>
      </div>
    </div>
  );
}

export function FileUploadPreview() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border-2 border-dashed border-grey-60 px-4 py-4 text-center">
      <span className="font-bold">Upload a file</span>
      <span className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-14 font-semibold text-green-80 shadow-[inset_0_0_0_2px_var(--color-green-80)] [&>svg]:size-4">
        <UploadSimple />
        Choose file
      </span>
    </div>
  );
}
