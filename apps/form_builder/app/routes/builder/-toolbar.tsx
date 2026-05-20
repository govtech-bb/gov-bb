import styles from "../../styles/builder.module.css";

interface ToolbarProps {
  formId: string;
  title: string;
  version: string;
  isDirty: boolean;
  isValidating: boolean;
  isPreviewing: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  lastSaveStatus: "idle" | "success" | "error" | "submitted";
  onFormIdChange: (id: string) => void;
  onTitleChange: (title: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onValidate: () => void;
  onPreview: () => void;
  onSubmit: () => void;
}

export function Toolbar({
  formId,
  title,
  version,
  isDirty,
  isValidating,
  isPreviewing,
  isSubmitting,
  canSubmit,
  lastSaveStatus,
  onFormIdChange,
  onTitleChange,
  onNew,
  onOpen,
  onValidate,
  onPreview,
  onSubmit,
}: ToolbarProps) {
  function handleNew() {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    onNew();
  }

  return (
    <div className={styles.toolbar}>
      <span className={styles.toolbarTitle}>Form Builder</span>
      <label>
        Form ID:
        <input
          type="text"
          value={formId}
          onChange={(e) => onFormIdChange(e.target.value)}
          style={{ marginLeft: 4 }}
        />
      </label>
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
        {isSubmitting ? "Submitting…" : "Submit"}
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
