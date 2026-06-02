import { useState } from "react";
import styles from "../../styles/builder.module.css";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./-id-validation";

const FORM_ID_REQUIRED_ERROR = "Form ID is required";

interface ToolbarProps {
  formId: string;
  title: string;
  version: string;
  /** Uniqueness error for the formId (e.g. id already taken), computed by the
   *  parent against the forms list. Shown alongside the local format error. */
  idError?: string | null;
  isDirty: boolean;
  /** Whether the live draft differs from the last saved/loaded baseline.
   *  Drives the "Unsaved changes" indicator and gates Save draft / Discard.
   *  Unlike `isDirty` ("the form is non-empty"), this goes clean right after
   *  a successful save. */
  hasUnsavedChanges: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  isPublishing: boolean;
  lastSaveStatus: "idle" | "success" | "error" | "submitted";
  onFormIdChange: (id: string) => void;
  onTitleChange: (title: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSubmit: () => void;
  onPublish: () => void;
  /** Revert the draft to the last saved baseline (or empty for a new form).
   *  Confirm-gating lives in the parent. */
  onDiscard: () => void;
}

export function Toolbar({
  formId,
  title,
  version,
  idError,
  isDirty,
  hasUnsavedChanges,
  isValidating,
  isPreviewing,
  isSubmitting,
  isPublishing,
  lastSaveStatus,
  onFormIdChange,
  onTitleChange,
  onNew,
  onOpen,
  onValidate,
  onPreview,
  onSubmit,
  onPublish,
  onDiscard,
}: ToolbarProps) {
  const [formIdError, setFormIdError] = useState<string>("");

  // The local format error (bad characters in the current input) takes
  // precedence over the parent's uniqueness error (id already taken).
  const shownFormIdError = formIdError || idError || "";

  function handleNew() {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    onNew();
  }

  return (
    <div className={styles.toolbar}>
      <span className={styles.toolbarTitle}>Form Builder</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <label>
          Form ID:
          <input
            type="text"
            value={formId}
            onChange={(e) => {
              const raw = e.target.value.toLowerCase().replace(/\s+/g, "-");
              // Always propagate so the controlled input reflects what the
              // author typed (even mid-edit / invalid). The error is surfaced
              // independently — empty is "required", anything else is checked
              // against the shared kebab pattern the server validator uses.
              onFormIdChange(raw);
              if (raw === "") {
                setFormIdError(FORM_ID_REQUIRED_ERROR);
              } else if (!KEBAB_ID_PATTERN.test(raw)) {
                setFormIdError(KEBAB_ID_ERROR);
              } else {
                setFormIdError("");
              }
            }}
            style={{ marginLeft: 4 }}
            aria-describedby={shownFormIdError ? "form-id-error" : undefined}
            aria-invalid={shownFormIdError ? true : undefined}
          />
        </label>
        {shownFormIdError && (
          <span
            id="form-id-error"
            role="alert"
            style={{ fontSize: "0.75rem", color: "red" }}
          >
            {shownFormIdError}
          </span>
        )}
      </div>
      <label>
        Title:
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          style={{ marginLeft: 4 }}
        />
      </label>
      <span className={styles.badge}>v{version}</span>
      <button type="button" onClick={handleNew}>New</button>
      <button type="button" onClick={onOpen}>Open</button>
      <button
        type="button"
        onClick={onValidate}
        disabled={isValidating}
      >
        {isValidating ? "Validating…" : "Validate"}
      </button>
      <button
        type="button"
        onClick={onPreview}
        disabled={isPreviewing}
      >
        {isPreviewing ? "Previewing…" : "Preview"}
      </button>
      <button
        type="button"
        onClick={onDiscard}
        disabled={!hasUnsavedChanges}
      >
        Discard
      </button>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onSubmit}
        disabled={isValidating || isSubmitting || !hasUnsavedChanges}
      >
        {isSubmitting ? "Submitting…" : "Save draft"}
      </button>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onPublish}
        disabled={isValidating || isPublishing}
      >
        {isPublishing ? "Opening PR…" : "Deploy"}
      </button>
      {hasUnsavedChanges && (
        <span className={styles.statusUnsaved}>● Unsaved changes</span>
      )}
      {lastSaveStatus !== "idle" && (
        <span
          className={
            lastSaveStatus === "error" ? styles.statusError : styles.statusOk
          }
        >
          {lastSaveStatus === "success" && "✓ Valid"}
          {lastSaveStatus === "error" && "✗ Invalid"}
          {lastSaveStatus === "submitted" && "✓ Submitted"}
        </span>
      )}
    </div>
  );
}
