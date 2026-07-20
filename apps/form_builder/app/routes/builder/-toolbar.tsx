import { useState, type ReactNode } from "react";
import {
  CheckmarkCircle02Icon,
  File01Icon,
  FolderOpenIcon,
  RocketIcon,
  Undo02Icon,
  ViewIcon,
} from "hugeicons-react";
import type { RecipeVisibility } from "@govtech-bb/form-types";
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
  /** Launch-gate visibility (#1682). `public` is citizen-reachable; `preview`
   *  serves the published recipe only via a token; `draft` is the DB scratch. */
  visibility: RecipeVisibility;
  onVisibilityChange: (visibility: RecipeVisibility) => void;
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

interface ToolbarStatusProps {
  hasUnsavedChanges: boolean;
  lastSaveStatus: ToolbarProps["lastSaveStatus"];
  isReadOnly: boolean;
  visibility: RecipeVisibility;
}

// The eyebrow line carries all transient status — the unsaved indicator, the
// last-save verdict and the deploy-blocker hint — so the actions row keeps a
// constant set of children and verdicts never reflow the header.
function ToolbarStatus({
  hasUnsavedChanges,
  lastSaveStatus,
  isReadOnly,
  visibility,
}: ToolbarStatusProps) {
  return (
    <div className={styles.eyebrowRow}>
      <span className={styles.eyebrow}>Form builder</span>
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
      {(isReadOnly || hasUnsavedChanges || visibility === "draft") && (
        <span className={styles.actionHint}>
          {isReadOnly
            ? "Another user is editing this form"
            : hasUnsavedChanges
              ? "Save draft before deploying"
              : "Set visibility to Preview or Public to deploy"}
        </span>
      )}
    </div>
  );
}

interface FormIdentityFieldsProps {
  title: string;
  onTitleChange: (title: string) => void;
  formId: string;
  onFormIdChange: (id: string) => void;
  idError?: string | null;
  visibility: RecipeVisibility;
  onVisibilityChange: (visibility: RecipeVisibility) => void;
  isReadOnly: boolean;
}

// Title + Form ID + Visibility inputs. Owns the Form ID's local format error
// (bad characters in the current input), which takes precedence over the
// parent's uniqueness error (id already taken).
function FormIdentityFields({
  title,
  onTitleChange,
  formId,
  onFormIdChange,
  idError,
  visibility,
  onVisibilityChange,
  isReadOnly,
}: FormIdentityFieldsProps) {
  const [formIdError, setFormIdError] = useState<string>("");
  const shownFormIdError = formIdError || idError || "";

  return (
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
            const raw = e.target.value.toLowerCase().replace(/\s+/g, "-");
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
          aria-describedby={shownFormIdError ? "form-id-error" : undefined}
          aria-invalid={shownFormIdError ? true : undefined}
        />
        {shownFormIdError && (
          <span id="form-id-error" role="alert" className={styles.idError}>
            {shownFormIdError}
          </span>
        )}
      </div>
      <div className={styles.idRow}>
        <label htmlFor="builder-visibility" className={styles.idLabel}>
          Visibility
        </label>
        <select
          id="builder-visibility"
          className={styles.visibilitySelect}
          aria-label="Visibility"
          value={visibility}
          onChange={(e) => onVisibilityChange(e.target.value as RecipeVisibility)}
          disabled={isReadOnly}
        >
          <option value="public">Public</option>
          <option value="preview">Preview</option>
          <option value="draft">Draft</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>
    </div>
  );
}

interface ToolbarActionsProps {
  isDirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  isValidating: boolean;
  onPreview: () => void;
  isPreviewing: boolean;
  onDiscard: () => void;
  hasUnsavedChanges: boolean;
  onSubmit: () => void;
  isSubmitting: boolean;
  onPublish: () => void;
  isPublishing: boolean;
  isReadOnly: boolean;
  visibility: RecipeVisibility;
}

const READ_ONLY_TITLE = "Another user is editing this form";
const UNSAVED_TITLE = "Save draft before deploying";
const DRAFT_VISIBILITY_TITLE = "Set visibility to Preview or Public to deploy";

// Save draft needs a non-empty change to a form nobody else is editing.
function saveDraftDisabled(p: ToolbarActionsProps): boolean {
  return p.isValidating || p.isSubmitting || !p.hasUnsavedChanges || p.isReadOnly;
}

// Deploy requires a saved draft (#331): publishing an unsaved draft opens a PR
// for a recipe the draft API has never seen. A `draft` visibility is "not
// ready" — only preview/public/maintenance recipes deploy (#1682/#1694).
function deployDisabled(p: ToolbarActionsProps): boolean {
  return (
    p.isValidating ||
    p.isPublishing ||
    p.hasUnsavedChanges ||
    p.isReadOnly ||
    p.visibility === "draft"
  );
}

// The tooltip explaining why Deploy is blocked, in the same precedence order as
// deployDisabled; `undefined` once nothing blocks it.
function deployTitle(p: ToolbarActionsProps): string | undefined {
  if (p.isReadOnly) return READ_ONLY_TITLE;
  if (p.hasUnsavedChanges) return UNSAVED_TITLE;
  if (p.visibility === "draft") return DRAFT_VISIBILITY_TITLE;
  return undefined;
}

// The action button row: New / Open / Validate / Preview / Discard icon
// buttons, then Save draft and Deploy. Owns the New confirm-gate and the
// Deploy enable/hint logic.
function ToolbarActions(props: ToolbarActionsProps) {
  const {
    isDirty,
    onNew,
    onOpen,
    onValidate,
    isValidating,
    onPreview,
    isPreviewing,
    onDiscard,
    hasUnsavedChanges,
    onSubmit,
    isSubmitting,
    onPublish,
    isPublishing,
    isReadOnly,
  } = props;

  function handleNew() {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    onNew();
  }

  return (
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
        disabled={saveDraftDisabled(props)}
        title={isReadOnly ? READ_ONLY_TITLE : undefined}
      >
        {isSubmitting ? "Submitting…" : "Save draft"}
      </button>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={onPublish}
        disabled={deployDisabled(props)}
        title={deployTitle(props)}
      >
        <RocketIcon size={14} />
        {isPublishing ? "Opening PR…" : "Deploy"}
      </button>
    </div>
  );
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
  visibility,
  onVisibilityChange,
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
  return (
    <div className={styles.toolbar}>
      <div className={styles.headerLeft}>
        {leading}
        {leading && (
          <span className={styles.headerDivider} aria-hidden="true" />
        )}
        <div className={styles.titleBlock}>
          <ToolbarStatus
            hasUnsavedChanges={hasUnsavedChanges}
            lastSaveStatus={lastSaveStatus}
            isReadOnly={isReadOnly}
            visibility={visibility}
          />
          <FormIdentityFields
            title={title}
            onTitleChange={onTitleChange}
            formId={formId}
            onFormIdChange={onFormIdChange}
            idError={idError}
            visibility={visibility}
            onVisibilityChange={onVisibilityChange}
            isReadOnly={isReadOnly}
          />
        </div>
      </div>

      <ToolbarActions
        isDirty={isDirty}
        onNew={onNew}
        onOpen={onOpen}
        onValidate={onValidate}
        isValidating={isValidating}
        onPreview={onPreview}
        isPreviewing={isPreviewing}
        onDiscard={onDiscard}
        hasUnsavedChanges={hasUnsavedChanges}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        onPublish={onPublish}
        isPublishing={isPublishing}
        isReadOnly={isReadOnly}
        visibility={visibility}
      />
    </div>
  );
}
