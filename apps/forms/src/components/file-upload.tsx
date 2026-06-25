import React from "react";
import { FileUploadProps, UploadedFile } from "@forms/types";
import ErrorMessage from "./error-message";
import { trackEvent } from "../lib/analytics";
import { uploadFile, FileUploadError } from "../lib/api/files";

/** A file being uploaded, or one whose upload failed. */
interface PendingUpload {
  id: number;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

const formatMb = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toPrecision(2)} MB`;

export default function FileUpload({
  field,
  sharedProps,
  onFileChange,
  value,
  errorMessage,
  errorId,
  formId,
  previewToken,
}: FileUploadProps) {
  const files = value ?? [];

  // Mirror the confirmed-file list in a ref so concurrent uploads (e.g. two
  // testimonials selected at once) accumulate instead of racing on the stale
  // `value` prop captured in each async closure.
  const confirmedRef = React.useRef<UploadedFile[]>(files);
  React.useEffect(() => {
    confirmedRef.current = value ?? [];
  }, [value]);

  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const idRef = React.useRef(0);

  // Single live region announcing every terminal change to screen readers —
  // added, removed, rejected, or failed (WCAG 4.1.3).
  const [statusMessage, setStatusMessage] = React.useState("");

  // presign's stepId is slug-validated, so strip any repeatable suffix
  // ("qualifications~1" → "qualifications") — the base step carries the policy.
  const presignStepId = field.stepId.split("~")[0];
  const maxSize = field.validations?.maxSize?.value as number | undefined;

  const appendConfirmed = (uploaded: UploadedFile) => {
    // Store the reference WITHOUT the expiring preview url (kept in memory only).
    const { url: _url, ...ref } = uploaded;
    const next = [...confirmedRef.current, ref];
    confirmedRef.current = next;
    onFileChange(next);
    setStatusMessage(`${ref.name} added.`);
  };

  const removeFile = (key: string) => {
    const removed = confirmedRef.current.find((f) => f.key === key);
    const next = confirmedRef.current.filter((f) => f.key !== key);
    confirmedRef.current = next;
    onFileChange(next.length ? next : null);
    if (removed) setStatusMessage(`${removed.name} removed.`);
  };

  const dismissPending = (id: number) =>
    setPending((prev) => prev.filter((p) => p.id !== id));

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";

    await Promise.all(
      picked.map(async (file) => {
        trackEvent("form-file-select", {
          form_id: formId,
          step_id: field.stepId,
          field_id: field.fieldId,
          mime: file.type,
          size_kb: Math.round(file.size / 1024),
        });

        const id = ++idRef.current;

        // Short-circuit oversize files before hitting the network.
        if (maxSize && file.size > maxSize) {
          const error = `This file is larger than the ${formatMb(maxSize)} limit.`;
          setPending((prev) => [
            ...prev,
            { id, name: file.name, status: "error", error },
          ]);
          setStatusMessage(`${file.name}: ${error}`);
          return;
        }

        setPending((prev) => [
          ...prev,
          { id, name: file.name, status: "uploading" },
        ]);

        try {
          const confirmed = await uploadFile({
            file,
            formId: formId ?? "",
            stepId: presignStepId,
            fieldId: field.fieldId,
            previewToken,
          });
          appendConfirmed(confirmed);
          setPending((prev) => prev.filter((p) => p.id !== id));
        } catch (err) {
          const message =
            err instanceof FileUploadError
              ? err.message
              : "Upload failed. Please try again.";
          setPending((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "error", error: message } : p,
            ),
          );
          setStatusMessage(`${file.name}: ${message}`);
        }
      }),
    );
  };

  // Accepts either MIME types ("image/png" → "png") or extension values
  // (".pdf" → ".pdf"), so a recipe can list user-friendly extensions and have
  // them shown verbatim (e.g. "Attach a .pdf, .docx, or .png file").
  const rawFileTypes: string[] = field.validations?.fileTypes?.value ?? [];
  const readableFileTypes: string[] = rawFileTypes.map((type: string) =>
    type.includes("/") ? type.split("/")[1] : type,
  );

  // Constrain the native picker to the allowed types. MIME types pass through;
  // bare extensions ("pdf") get a leading dot so the picker recognises them.
  const acceptAttr =
    rawFileTypes
      .map((type) =>
        type.includes("/") || type.startsWith(".") ? type : `.${type}`,
      )
      .join(",") || undefined;

  const fileTypeFormatter = new Intl.ListFormat("en", {
    style: "long",
    type: "disjunction",
  });

  return (
    <div className="govbb-file-upload">
      {errorMessage && <ErrorMessage id={errorId} message={errorMessage} />}
      <label className="govbb-file-upload__dropzone" htmlFor={field.id}>
        <div className="govbb-file-upload__info">
          <span className="govbb-file-upload__title">
            {field.label ?? "Upload a file"}
          </span>
          <span className="govbb-file-upload__subtitle">
            {readableFileTypes.length
              ? `Attach a ${fileTypeFormatter.format(readableFileTypes)} file`
              : "No file type restrictions"}
          </span>
        </div>

        <input
          {...sharedProps}
          type="file"
          accept={sharedProps.accept ?? acceptAttr}
          multiple={field.multiple ?? false}
          className="govbb-file-upload__input"
          aria-invalid={errorMessage ? true : undefined}
          onChange={handleInputChange}
        />

        <div className="govbb-file-upload__action">
          <span className="govbb-btn--tertiary" aria-hidden="true">
            Choose file
          </span>
          <span className="govbb-file-upload__max-size">
            Max Size: {maxSize ? formatMb(maxSize) : "--"}
          </span>
        </div>
      </label>

      <div role="status" aria-live="polite" className="govbb-visually-hidden">
        {statusMessage}
      </div>

      {(files.length > 0 || pending.length > 0) && (
        <ul className="govbb-file-upload__list">
          {files.map((f) => (
            <li key={f.key} className="govbb-file-upload__item">
              <span className="govbb-file-upload__name">{f.name}</span>
              <button
                type="button"
                className="govbb-btn--destructive-link"
                aria-label={`Remove ${f.name}`}
                onClick={() => removeFile(f.key)}
              >
                Remove
              </button>
            </li>
          ))}

          {pending.map((p) => (
            <li
              key={`pending-${p.id}`}
              className="govbb-file-upload__item govbb-file-upload__item--pending"
            >
              <span className="govbb-file-upload__name">{p.name}</span>
              {p.status === "uploading" ? (
                <span className="govbb-file-upload__status">Uploading…</span>
              ) : (
                <span className="govbb-file-upload__status govbb-file-upload__status--error">
                  {p.error}{" "}
                  <button
                    type="button"
                    className="govbb-btn--destructive-link"
                    aria-label={`Dismiss ${p.name}`}
                    onClick={() => dismissPending(p.id)}
                  >
                    Dismiss
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
