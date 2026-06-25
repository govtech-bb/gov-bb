import { useState, type ReactNode } from "react";
import {
  CheckmarkCircle02Icon,
  File01Icon,
  FolderOpenIcon,
  RocketIcon,
  Undo02Icon,
  ViewIcon,
} from "hugeicons-react";
import { Tip } from "../content/-sliding-tabs";
import styles from "../../styles/builder.module.css";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "./-id-validation";

const FORM_ID_REQUIRED_ERROR = "Form ID is required";

interface ToolbarProps {
  /** Rendered before the title — the Builder ⇄ Content section switch and the
   *  theme toggle live here so this component stays router-free (testable). */
  leading?: ReactNode;
  formId: string;
  title: string;
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
  /** Read-only lock (#874): another user holds the editing claim. Disables the
   *  Form ID / Title inputs and the Save draft / Deploy actions. */
  isReadOnly: boolean;
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
  leading,
  formId,
  title,
  idError,
  isDirty,
  hasUnsavedChanges,
  isValidating,
  isPreviewing,
  isSubmitting,
  isPublishing,
  isReadOnly,
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
      <div className={styles.headerLeft}>
        {leading}
        {leading && (
          <span className={styles.headerDivider} aria-hidden="true" />
        )}
        <div className={styles.titleBlock}>
          {/* All transient status lives on this line — the actions row keeps
              a constant set of children so verdicts never reflow the header. */}
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>Form builder</span>
            {hasUnsavedChanges && (
              <span className={styles.statusUnsaved}>● Unsaved changes</span>
            )}
            {lastSaveStatus !== "idle" && (
              <span
                className={
                  lastSaveStatus === "error"
                    ? styles.statusError
                    : styles.statusOk
                }
              >
                {lastSaveStatus === "success" && "✓ Valid"}
                {lastSaveStatus === "error" && "✗ Invalid"}
                {lastSaveStatus === "submitted" && "✓ Submitted"}
              </span>
            )}
            {(isReadOnly || hasUnsavedChanges) && (
              <span className={styles.actionHint}>
                {isReadOnly
                  ? "Another user is editing this form"
                  : "Save draft before deploying"}
              </span>
            )}
          </div>
          <div className={styles.fieldsRow}>
            <input
              type="text"
              className={styles.titleInput}
              aria-label="Title"
              placeholder="Untitled form"
              value={title}
              title={title || undefined}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={isReadOnly}
            />
            <div className={styles.idRow}>
              <label htmlFor="builder-form-id" className={styles.idLabel}>
                ID
              </label>
              <input
                id="builder-form-id"
                type="text"
                className={styles.idInput}
                aria-label="Form ID"
                placeholder="form-id"
                value={formId}
                title={formId || undefined}
                onChange={(e) => {
                  const raw = e.target.value
                    .toLowerCase()
                    .replace(/\s+/g, "-");
                  // Always propagate so the controlled input reflects what the
                  // author typed (even mid-edit / invalid). The error is
                  // surfaced independently — empty is "required", anything
                  // else is checked against the shared kebab pattern the
                  // server validator uses.
                  onFormIdChange(raw);
                  if (raw === "") {
                    setFormIdError(FORM_ID_REQUIRED_ERROR);
                  } else if (!KEBAB_ID_PATTERN.test(raw)) {
                    setFormIdError(KEBAB_ID_ERROR);
                  } else {
                    setFormIdError("");
                  }
                }}
                disabled={isReadOnly}
                aria-describedby={
                  shownFormIdError ? "form-id-error" : undefined
                }
                aria-invalid={shownFormIdError ? true : undefined}
              />
              {shownFormIdError && (
                <span
                  id="form-id-error"
                  role="alert"
                  className={styles.idError}
                >
                  {shownFormIdError}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.headerActions}>
        <Tip label="New form" placement="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="New"
            onClick={handleNew}
          >
            <File01Icon size={15} />
          </button>
        </Tip>
        <Tip label="Open form" placement="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Open"
            onClick={onOpen}
          >
            <FolderOpenIcon size={15} />
          </button>
        </Tip>
        <span className={styles.headerDivider} aria-hidden="true" />
        <Tip label={isValidating ? "Validating…" : "Validate"} placement="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Validate"
            onClick={onValidate}
            disabled={isValidating}
          >
            <CheckmarkCircle02Icon size={15} />
          </button>
        </Tip>
        <Tip label={isPreviewing ? "Previewing…" : "Preview"} placement="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Preview"
            onClick={onPreview}
            disabled={isPreviewing}
          >
            <ViewIcon size={15} />
          </button>
        </Tip>
        <Tip label="Discard changes" placement="bottom">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Discard"
            onClick={onDiscard}
            disabled={!hasUnsavedChanges}
          >
            <Undo02Icon size={15} />
          </button>
        </Tip>
        <span className={styles.headerDivider} aria-hidden="true" />
        <button
          type="button"
          onClick={onSubmit}
          disabled={
            isValidating || isSubmitting || !hasUnsavedChanges || isReadOnly
          }
          title={isReadOnly ? "Another user is editing this form" : undefined}
        >
          {isSubmitting ? "Submitting…" : "Save draft"}
        </button>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={onPublish}
          // Deploy requires a saved draft (#331): publishing an unsaved draft
          // opens a PR for a recipe the draft API has never seen.
          disabled={
            isValidating || isPublishing || hasUnsavedChanges || isReadOnly
          }
          title={
            isReadOnly
              ? "Another user is editing this form"
              : hasUnsavedChanges
                ? "Save draft before deploying"
                : undefined
          }
        >
          <RocketIcon size={14} />
          {isPublishing ? "Opening PR…" : "Deploy"}
        </button>
      </div>
    </div>
  );
}
