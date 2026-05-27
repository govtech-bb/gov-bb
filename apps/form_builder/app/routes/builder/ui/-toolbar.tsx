import { useState } from "react";
import styles from "../../../styles/builder.module.css";

const FORM_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FORM_ID_ERROR =
  "Use lowercase letters, numbers, and hyphens only (e.g. birth-registration)";

interface ToolbarProps {
  formId: string;
  title: string;
  version: string;
  isDirty: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  isPublishing: boolean;
  canSubmit: boolean;
  lastSaveStatus: "idle" | "success" | "error" | "submitted";
  onFormIdChange: (id: string) => void;
  onTitleChange: (title: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSubmit: () => void;
  onPublish: () => void;
}

export function Toolbar({
  formId,
  title,
  version,
  isDirty,
  isValidating,
  isPreviewing,
  isSubmitting,
  isPublishing,
  canSubmit,
  lastSaveStatus,
  onFormIdChange,
  onTitleChange,
  onNew,
  onOpen,
  onValidate,
  onPreview,
  onSubmit,
  onPublish,
}: ToolbarProps) {
  const [formIdError, setFormIdError] = useState<string>("");

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
              if (raw.length > 0 && !FORM_ID_PATTERN.test(raw)) {
                setFormIdError(FORM_ID_ERROR);
              } else {
                setFormIdError("");
                onFormIdChange(raw);
              }
            }}
            style={{ marginLeft: 4 }}
            aria-describedby={formIdError ? "form-id-error" : undefined}
            aria-invalid={formIdError ? true : undefined}
          />
        </label>
        {formIdError && (
          <span
            id="form-id-error"
            role="alert"
            style={{ fontSize: "0.75rem", color: "red" }}
          >
            {formIdError}
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
        className={styles.btnPrimary}
        onClick={onSubmit}
        disabled={!canSubmit || isSubmitting}
      >
        {isSubmitting ? "Submitting…" : "Save draft"}
      </button>
      {import.meta.env.DEV && (
        <span className={styles.toolbarHint}>
          Saved drafts are served by the local API immediately — no PR needed.
        </span>
      )}
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onPublish}
        disabled={!canSubmit || isPublishing}
      >
        {isPublishing ? "Opening PR…" : "Deploy"}
      </button>
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
