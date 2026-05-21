import React from "react";
import { FileUploadProps } from "@forms/types";
import ErrorMessage from "./error-message";
import { trackEvent } from "../lib/analytics";

export default function FileUpload({
  field,
  sharedProps,
  onFileChange,
  value,
  errorMessage,
  validationRules,
  formId,
}: FileUploadProps) {
  const files = value ?? [];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const currentFiles = e.target.files;
    const picked = currentFiles ? Array.from(currentFiles) : [];
    picked.forEach((file) => {
      trackEvent("form-file-select", {
        form_id: formId,
        step_id: field.stepId,
        field_id: field.fieldId,
        mime: file.type,
        size_kb: Math.round(file.size / 1024),
      });
    });
    const updatedFiles = [...files, ...picked];
    onFileChange(updatedFiles.length ? updatedFiles : null);
    e.target.value = "";
  };

  const handleChooseClick = () => {
    const input = document.querySelector(
      `input[type="file"][name="${sharedProps.name}"]`,
    ) as HTMLInputElement | null;
    input?.click();
  };

  const removeFile = (index: number) => {
    const next = files.slice();
    next.splice(index, 1);
    onFileChange?.(next.length ? next : null);
  };

  const readableFileTypes = field.validations?.fileTypes?.value
    .map((type: string) => type.split("/")[1]) // "image/png" → "png"
    .join(", ");

  const fileTypeFormatter = new Intl.ListFormat("en", {
    style: "long",
    type: "disjunction",
  });

  return (
    <div data-file-upload>
      {errorMessage && <ErrorMessage message={errorMessage} />}
      <label data-file-upload-label>
        <div data-file-upload-instructions>
          <span data-file-upload-title>{field.label ?? "Upload a file"}</span>
          <span data-file-upload-description>
            {field.validations?.fileTypes?.value
              ? `Attach a ${fileTypeFormatter.format(readableFileTypes.split(", "))} file`
              : "No file type restrictions"}
          </span>
        </div>

        <input
          {...sharedProps}
          type="file"
          data-file-upload-input
          onChange={handleInputChange}
        />

        <div data-file-upload-information>
          <button
            type="button"
            data-file-upload-button
            onClick={handleChooseClick}
          >
            Choose file
          </button>
          <span data-file-upload-limit>
            Max Size:{" "}
            {validationRules?.maxSize?.value
              ? (validationRules.maxSize.value / (1024 * 1024)).toPrecision(2) +
                " MB"
              : "--"}
          </span>
        </div>
      </label>

      {files.length > 0 && (
        <div data-file-upload-list>
          {files.map((f, i) => (
            <div key={i} data-file-upload-item>
              <span data-file-upload-item-name>{f.name}</span>
              <button
                type="button"
                data-file-upload-remove
                onClick={() => removeFile(i)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
