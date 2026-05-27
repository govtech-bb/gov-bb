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
    <div className="govbb-file-upload">
      {errorMessage && <ErrorMessage message={errorMessage} />}
      <label className="govbb-file-upload__dropzone" htmlFor={field.id}>
        <div className="govbb-file-upload__info">
          <span className="govbb-file-upload__title">
            {field.label ?? "Upload a file"}
          </span>
          <span className="govbb-file-upload__subtitle">
            {field.validations?.fileTypes?.value
              ? `Attach a ${fileTypeFormatter.format(readableFileTypes.split(", "))} file`
              : "No file type restrictions"}
          </span>
        </div>

        <input
          {...sharedProps}
          type="file"
          className="govbb-file-upload__input"
          aria-invalid={errorMessage ? true : undefined}
          onChange={handleInputChange}
        />

        <div className="govbb-file-upload__action">
          <span className="govbb-btn--tertiary" aria-hidden="true">
            Choose file
          </span>
          <span className="govbb-file-upload__max-size">
            Max Size:{" "}
            {validationRules?.maxSize?.value
              ? (validationRules.maxSize.value / (1024 * 1024)).toPrecision(2) +
                " MB"
              : "--"}
          </span>
        </div>
      </label>

      {files.length > 0 && (
        <ul className="govbb-file-upload__list">
          {files.map((f, i) => (
            <li key={i} className="govbb-file-upload__item">
              <span className="govbb-file-upload__name">{f.name}</span>
              <button
                type="button"
                className="govbb-btn--destructive-link"
                aria-label={`Remove ${f.name}`}
                onClick={() => removeFile(i)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
