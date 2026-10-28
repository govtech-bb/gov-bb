import React from "react";
import { Button, FileUpload as GovFileUpload } from "@govtech-bb/react";
import { FileUploadProps, UploadedFile } from "@forms/types";
import ErrorMessage from "./error-message";
import { optionalSuffix } from "./field-renderer/optional-suffix";
import { trackEvent } from "../lib/analytics";
import { formCategory } from "../lib/form-category";
import {
  sendFile,
  checkFile,
  UPLOAD_PROBLEM_MESSAGE,
  UPLOAD_IN_PROGRESS_MESSAGE,
  UPLOAD_NOT_ADDED_MESSAGE,
  UPLOAD_REFUSED_MESSAGE,
  setUploadBlock,
} from "../lib/api/files";
import {
  fileTypesRunner,
  INFECTED_FILE_MESSAGE,
  UNSCANNABLE_FILE_MESSAGE,
} from "@govtech-bb/form-validation";

/**
 * Where a picked file is on its way to becoming a form value (#2940).
 * - uploading / checking: in progress (sending to S3, then the malware scan)
 * - rejected: refused before upload (type or size); Dismiss only
 * - infected / unscannable: the scan refused it; Remove only
 * - timeout / error: the scan took too long, or a request failed; Retry or Remove
 * Only a clean file leaves this list, by becoming a form value.
 */
type PendingStatus =
  | "uploading"
  | "checking"
  | "rejected"
  | "infected"
  | "unscannable"
  | "timeout"
  | "error";

interface PendingUpload {
  id: number;
  name: string;
  status: PendingStatus;
  /** Fraction sent to S3, 0 to 1, while uploading. */
  progress?: number;
  error?: string;
  /** Kept so Retry can run again without the person picking the file again. */
  file?: File;
  /** Set once the file is in S3, so Retry only re-checks it. */
  key?: string;
}

const CHECKING_MESSAGE = "Checking your file";

/**
 * Why Continue has to wait for this field, or undefined. A file refused before
 * upload (`rejected`) doesn't block: it never started, so nothing is lost.
 */
function continueBlock(pending: PendingUpload[]): string | undefined {
  if (
    pending.some((p) => p.status === "uploading" || p.status === "checking")
  ) {
    return UPLOAD_IN_PROGRESS_MESSAGE;
  }
  // Only offer Retry in the message when a row actually has a Retry button.
  if (pending.some((p) => p.status === "timeout" || p.status === "error")) {
    return UPLOAD_NOT_ADDED_MESSAGE;
  }
  if (pending.some((p) => p.status !== "rejected")) {
    return UPLOAD_REFUSED_MESSAGE;
  }
  return undefined;
}
const SCAN_TIMEOUT_MESSAGE =
  "We could not finish checking your file. Try again.";

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
  onUploadsChange,
}: FileUploadProps) {
  const files = value ?? [];
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Mirror the confirmed-file list in a ref so concurrent uploads (e.g. two
  // testimonials selected at once) accumulate instead of racing on the stale
  // `value` prop captured in each async closure.
  const confirmedRef = React.useRef<UploadedFile[]>(files);
  React.useEffect(() => {
    confirmedRef.current = value ?? [];
  }, [value]);

  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const idRef = React.useRef(0);

  // Tell the step's Continue (through the field validator) whether it has to
  // wait, and let the field re-judge a shown error as that changes. Only on a
  // change: re-judging as the step first shows would wipe the error the server
  // put on the field at submit (an unsafe file), and nothing has changed yet.
  const blockReason = continueBlock(pending);
  const onUploadsChangeRef = React.useRef(onUploadsChange);
  onUploadsChangeRef.current = onUploadsChange;
  const reportedBlockRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    setUploadBlock(field.id, blockReason);
    if (reportedBlockRef.current === blockReason) return;
    reportedBlockRef.current = blockReason;
    onUploadsChangeRef.current?.();
  }, [field.id, blockReason]);
  React.useEffect(() => () => setUploadBlock(field.id, undefined), [field.id]);

  // Single live region announcing every terminal change to screen readers —
  // added, removed, rejected, or failed (WCAG 4.1.3).
  const [statusMessage, setStatusMessage] = React.useState("");

  // presign's stepId is slug-validated, so strip any repeatable suffix
  // ("qualifications~1" → "qualifications") — the base step carries the policy.
  const presignStepId = field.stepId.split("~")[0];
  const maxSize = field.validations?.maxSize?.value as number | undefined;

  const appendConfirmed = (uploaded: UploadedFile) => {
    // Store the reference WITHOUT the expiring preview url (kept in memory only)
    // or the scan verdict: the API reads the verdict itself at submit.
    const { url: _url, scanStatus: _scanStatus, ...ref } = uploaded;
    const next = [...confirmedRef.current, ref];
    confirmedRef.current = next;
    onFileChange(next);
    setStatusMessage(`${ref.name} added.`);
  };

  const removeFile = (key: string) => {
    inputRef.current?.focus();
    const removed = confirmedRef.current.find((f) => f.key === key);
    const next = confirmedRef.current.filter((f) => f.key !== key);
    confirmedRef.current = next;
    onFileChange(next.length ? next : null);
    if (removed) setStatusMessage(`${removed.name} removed.`);
  };

  // Each row's run can be cancelled: Remove on a row still uploading or
  // checking, and every run when the field leaves the page. A cancelled run
  // never touches state or the value again, so a run that outlives its field
  // can't overwrite what the person has uploaded since.
  const runsRef = React.useRef(new Map<number, AbortController>());
  React.useEffect(() => {
    const runs = runsRef.current;
    return () => runs.forEach((run) => run.abort());
  }, []);

  const dismissPending = (id: number) => {
    inputRef.current?.focus();
    runsRef.current.get(id)?.abort();
    runsRef.current.delete(id);
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePending = (id: number, patch: Partial<PendingUpload>) =>
    setPending((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  /** Leave the row showing why the file was not added, and say so. */
  const settle = (
    id: number,
    name: string,
    status: PendingStatus,
    error: string,
  ) => {
    updatePending(id, { status, error });
    setStatusMessage(`${name}: ${error}`);
  };

  /**
   * Sends the file (unless it is already in S3), waits for the scan verdict,
   * and adds it to the form only when it is clean. A missing verdict counts as
   * clean: the upload page is for the person's benefit, and the API still
   * refuses a file that isn't clean at submit (ADR 0078). A verdict we don't
   * know is treated as "couldn't check".
   */
  const runUpload = async (id: number, file: File, sentKey?: string) => {
    // One run per row: stop any earlier run for it, so two never both add
    // the file.
    runsRef.current.get(id)?.abort();
    const run = new AbortController();
    runsRef.current.set(id, run);
    const { signal } = run;
    let key = sentKey;
    let lastPercent = -1;
    try {
      if (!key) {
        updatePending(id, {
          status: "uploading",
          progress: 0,
          error: undefined,
        });
        setStatusMessage(`Uploading ${file.name}`);
        key = await sendFile({
          file,
          formId: formId ?? "",
          stepId: presignStepId,
          fieldId: field.fieldId,
          previewToken,
          draftToken,
          // Progress events come many times a second; re-render only when
          // the bar would move a whole percent.
          onProgress: (progress) => {
            const percent = Math.round(progress * 100);
            if (signal.aborted || percent === lastPercent) return;
            lastPercent = percent;
            updatePending(id, { progress });
          },
          signal,
        });
        if (signal.aborted) return;
      }
      updatePending(id, { status: "checking", key, error: undefined });
      setStatusMessage(`Checking ${file.name}`);
      const checked = await checkFile({
        key,
        formId: formId ?? "",
        stepId: presignStepId,
        fieldId: field.fieldId,
        previewToken,
        draftToken,
        signal,
      });
      if (signal.aborted) return;
      if (checked === "timeout") {
        settle(id, file.name, "timeout", SCAN_TIMEOUT_MESSAGE);
      } else if (!checked.scanStatus || checked.scanStatus === "clean") {
        appendConfirmed(checked);
        setPending((prev) => prev.filter((p) => p.id !== id));
      } else if (checked.scanStatus === "infected") {
        settle(id, file.name, "infected", INFECTED_FILE_MESSAGE);
      } else {
        settle(id, file.name, "unscannable", UNSCANNABLE_FILE_MESSAGE);
      }
    } catch {
      if (signal.aborted) return;
      // Keep the key: if the file reached S3, Retry only re-checks it.
      updatePending(id, { key });
      settle(id, file.name, "error", UPLOAD_PROBLEM_MESSAGE);
    } finally {
      if (runsRef.current.get(id) === run) runsRef.current.delete(id);
    }
  };

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
            { id, name: file.name, status: "rejected", error: rejection },
          ]);
          setStatusMessage(`${file.name}: ${rejection}`);
          return;
        }

        // Short-circuit oversize files before hitting the network.
        if (maxSize && file.size > maxSize) {
          const error = `This file is larger than the ${formatMb(maxSize)} limit.`;
          setPending((prev) => [
            ...prev,
            { id, name: file.name, status: "rejected", error },
          ]);
          setStatusMessage(`${file.name}: ${error}`);
          return;
        }

        setPending((prev) => [
          ...prev,
          { id, name: file.name, status: "uploading", progress: 0, file },
        ]);
        await runUpload(id, file);
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
    <div className="govbb-file-upload form-page__file-field">
      {errorMessage && <ErrorMessage id={errorId} message={errorMessage} />}
      <GovFileUpload
        {...sharedProps}
        ref={inputRef}
        accept={sharedProps.accept ?? acceptAttr}
        multiple={field.multiple ?? false}
        aria-invalid={errorMessage ? true : undefined}
        onChange={handleInputChange}
        title={
          <>
            {field.label ?? "Upload a file"}
            {optionalSuffix(field)}
          </>
        }
        subtitle={
          <span id={field.hint ? `${field.id}-hint` : undefined}>
            {field.hint?.trim()
              ? field.hint
              : readableFileTypes.length
                ? `Attach a ${fileTypeFormatter.format(readableFileTypes)} file`
                : "No file type restrictions"}
          </span>
        }
        maxSize={maxSize ? `Max Size: ${formatMb(maxSize)}` : undefined}
      />

      <div role="status" aria-live="polite" className="govbb-visually-hidden">
        {statusMessage}
      </div>

      {(files.length > 0 || pending.length > 0) && (
        <ul className="govbb-file-upload__list">
          {files.map((f) => (
            <li key={f.key} className="govbb-file-upload__item">
              <span className="govbb-file-upload__name">{f.name}</span>
              <Button
                variant="text"
                negative
                className="no-print"
                aria-label={`Remove ${f.name}`}
                onClick={() => removeFile(f.key)}
              >
                Remove
              </Button>
            </li>
          ))}

          {pending.map((p) => (
            <li
              key={`pending-${p.id}`}
              className="govbb-file-upload__item govbb-file-upload__item--pending"
            >
              <span className="govbb-file-upload__name">{p.name}</span>
              <PendingStatusView
                upload={p}
                onRetry={() => {
                  // The Retry button goes away as the row restarts.
                  inputRef.current?.focus();
                  if (p.file) void runUpload(p.id, p.file, p.key);
                }}
                onRemove={() => dismissPending(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The actions and status line for one file that is not (yet) a form value.
 * The row wraps the status onto its own line under the name and actions, so
 * the bar has the full width and nothing shifts as the text changes.
 */
function PendingStatusView({
  upload: p,
  onRetry,
  onRemove,
}: {
  upload: PendingUpload;
  onRetry: () => void;
  onRemove: () => void;
}) {
  // Every row has a way out, including one still in progress: a stalled
  // upload must never trap the person behind a blocked Continue. Mid-run that
  // is a neutral Cancel, not the red Remove of a settled row.
  const inProgress = p.status === "uploading" || p.status === "checking";
  const removeLabel = inProgress
    ? "Cancel"
    : p.status === "rejected"
      ? "Dismiss"
      : "Remove";
  const retryable = p.status === "timeout" || p.status === "error";
  const actions = (
    <span className="govbb-file-upload__actions no-print">
      {retryable && (
        <Button variant="text" aria-label={`Retry ${p.name}`} onClick={onRetry}>
          Retry
        </Button>
      )}
      <Button
        variant="text"
        negative={!inProgress}
        aria-label={`${removeLabel} ${p.name}`}
        onClick={onRemove}
      >
        {removeLabel}
      </Button>
    </span>
  );
  if (p.status === "uploading") {
    return (
      <>
        {actions}
        <div className="govbb-file-upload__status">
          Uploading…
          <progress
            className="govbb-file-upload__progress"
            max={1}
            value={p.progress ?? 0}
            aria-label={`Uploading ${p.name}`}
          />
        </div>
      </>
    );
  }
  if (p.status === "checking") {
    // GuardDuty reports no percentage, so this bar has no value (indeterminate).
    return (
      <>
        {actions}
        <div className="govbb-file-upload__status">
          {CHECKING_MESSAGE}
          <progress
            className="govbb-file-upload__progress"
            aria-label={`Checking ${p.name}`}
          />
        </div>
      </>
    );
  }
  return (
    <>
      {actions}
      <div className="govbb-file-upload__status govbb-file-upload__status--error">
        {p.error}
      </div>
    </>
  );
}
