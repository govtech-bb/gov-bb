import type { RecipeDraft } from "@govtech-bb/form-builder";
import { formPreviewUrl } from "../../lib/form-url";
import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

interface SubmitModalProps {
  draft: RecipeDraft;
  loadedFromId: string | null;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string | null;
  /** Read-only lock (#874): another user holds the editing claim. Warns and
   *  disables the action even if the modal was already open when it flipped. */
  isReadOnly?: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function SubmitModal({
  draft,
  loadedFromId,
  isSubmitting,
  submitSuccess,
  submitError,
  isReadOnly = false,
  onSubmit,
  onClose,
}: SubmitModalProps) {
  const isUpdate = loadedFromId !== null;
  const mode = isUpdate ? "Save Changes" : "Submit Recipe";

  useEscClose(onClose);

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} role="dialog" aria-modal="true" aria-label={mode} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <strong>{mode}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        {submitSuccess ? (
          <div className={styles.validationSuccess}>
            Recipe submitted successfully!
            <div style={{ marginTop: 8 }}>
              <a
                href={formPreviewUrl(draft.formId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                🔗 Preview form
              </a>
            </div>
          </div>
        ) : (
          <div>
            {isReadOnly && (
              <div className={styles.presenceBanner} role="alert" style={{ marginBottom: 8 }}>
                Another user is currently editing this form. Saving is disabled
                until their editing session ends.
              </div>
            )}
            <div className={styles.formGroup}>
              <label>Form ID</label>
              <input type="text" value={draft.formId} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label>Title</label>
              <input type="text" value={draft.title} readOnly />
            </div>

            {submitError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnPrimary} onClick={onSubmit} disabled={isSubmitting || isReadOnly}>
                {isSubmitting ? "Submitting…" : mode}
              </button>
              <button type="button" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
