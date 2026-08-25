import React from "react";
import { FileUploadProps, UploadedFile } from "@forms/types";
import ErrorMessage from "./error-message";
import { optionalSuffix } from "./field-renderer/optional-suffix";
import { trackEvent } from "../lib/analytics";
import { formCategory } from "../lib/form-category";
import { uploadFile, FileUploadError } from "../lib/api/files";
import { fileTypesRunner } from "@govtech-bb/form-validation";

/** A file being uploaded, or one whose upload failed. */
interface PendingUpload {
  id: number;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

const formatMb = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toPrecision(2)} MB`;

/** Mirrors the API's presign message for a file it cannot identify by type. */
const UNIDENTIFIED_FILE_ERROR =
  "The file type could not be identified. Rename the file so it has its " +
  "correct extension (for example .pdf or .jpg) and try again.";

export default function FileUpload({
  field,
  sharedProps,
  onFileChange,
  value,
  errorMessage,
  errorId,
  formId,
  previewToken,
  draftToken,
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

  // Accepts either MIME types ("image/png" → "png") or extension values
  // (".pdf" → ".pdf"), so a recipe can list user-friendly extensions and have
  // them shown verbatim (e.g. "Attach a .pdf, .docx, or .png file").
  //
  // #2384: the value is declared `string[]`, but a builder-authored recipe
  // reached production carrying a comma-separated string, so `.map` threw and
  // the error boundary replaced the whole step with "Something went wrong".
  // The recipe schema now rejects that shape, but DB drafts (`?draft=`) never
  // pass through CI, so normalise here too — the same tolerance
  // `fileTypesRunner` already applies on the validation side.
  const configuredFileTypes: unknown = field.validations?.fileTypes?.value;
  const rawFileTypes: string[] = Array.isArray(configuredFileTypes)
    ? configuredFileTypes
    : typeof configuredFileTypes === "string"
      ? configuredFileTypes
          .split(",")
          .map((type) => type.trim())
          .filter(Boolean)
      : [];

  // A file field with no `fileTypes` cannot say what it accepts. That is a
  // recipe defect — `validate-recipes` now rejects it, so it can only reach a
  // citizen through a DB draft — and it is not something an applicant can act
  // on, so it degrades rather than blocks: a typed file still uploads (exactly
  // what the API's presign gate allows), and only an unidentifiable one is
  // refused. Warn once in the console for whoever is reviewing the form.
  const configuredTypes = field.validations?.fileTypes;
  const isUnconstrained = rawFileTypes.length === 0;
  React.useEffect(() => {
    if (!isUnconstrained) return;
    console.warn(
      `[file-upload] ${formId ?? "(unknown form)"} ${field.stepId}.${field.fieldId}: ` +
        "no `fileTypes` validation is configured, so an unidentifiable file " +
        "cannot be accepted. Add a fileTypes rule to the recipe.",
    );
  }, [isUnconstrained, formId, field.stepId, field.fieldId]);

  /**
   * The reason to refuse `file`, or null to let it upload. Mirrors the API's
   * presign gate so the two agree: the shared runner matches an allowlist entry
   * by MIME or by extension, and a file the browser could not type at all can
   * only ever match on its extension.
   */
  const rejectUnacceptable = (file: File): string | null => {
    // No allowlist: nothing can establish that an unidentifiable file is a
    // permitted type, so refuse only that one case — the same call the API
    // makes. Refusing every file here instead would leave a required upload on
    // such a field impossible to satisfy.
    if (isUnconstrained) {
      return file.type === "" ? UNIDENTIFIED_FILE_ERROR : null;
    }
    const error = fileTypesRunner(
      [{ name: file.name, size: file.size, type: file.type }],
      configuredTypes!,
    );
    if (!error) return null;
    // A file the browser could not type is the confusing case — the applicant
    // sees a rejection with nothing obviously wrong with the file — so name the
    // fix rather than only restating the allowed formats.
    return file.type === ""
      ? `${error} We could not tell what kind of file this is; check it has the right extension (for example .pdf or .jpg).`
      : error;
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";

    await Promise.all(
      picked.map(async (file) => {
        trackEvent("form-file-select", {
          form: formId ?? "",
          category: formCategory(formId ?? ""),
          step: field.stepId,
          field: field.fieldId,
          mime: file.type,
          size_kb: Math.round(file.size / 1024),
        });

        const id = ++idRef.current;

        // Refuse a file we cannot show is an accepted type BEFORE uploading it.
        // The API enforces the same rule at presign, but rejecting here is what
        // puts the recipe's own `fileTypes.error` copy in front of the
        // applicant — a presign rejection only ever surfaced as the generic
        // "File upload failed", so the authored message never reached anyone.
        const rejection = rejectUnacceptable(file);
        if (rejection) {
          setPending((prev) => [
            ...prev,
            { id, name: file.name, status: "error", error: rejection },
          ]);
          setStatusMessage(`${file.name}: ${rejection}`);
          return;
        }

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
            draftToken,
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
            {optionalSuffix(field)}
          </span>
          <span className="govbb-file-upload__subtitle">
            {field.hint?.trim()
              ? field.hint
              : readableFileTypes.length
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
          {/* Only shown when the field actually caps size. A recipe that sets
              only `itemMaxSize` (a per-file cap) has no `maxSize`, and the old
              "Max Size: --" placeholder read as a broken value rather than as
              "no limit". Ternary, not `&&` — a 0 would render as "0". */}
          {maxSize ? (
            <span className="govbb-file-upload__max-size">
              Max Size: {formatMb(maxSize)}
            </span>
          ) : null}
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
