import styles from "../../styles/builder.module.css";

interface DeleteModalProps {
  formId: string;
  title: string;
  isDeleting: boolean;
  deleteError: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

// A light confirm for deleting a *draft* form: the API removes the draft's
// form_definitions rows. No tombstone is written, so the form ID stays
// available for reuse. No reason is collected — this only ever applies to
// unpublished drafts (published forms use Disable instead).
export function DeleteModal({
  formId,
  title,
  isDeleting,
  deleteError,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <strong>Delete Draft</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p>
          Delete the draft <strong>{title || formId}</strong> (
          <code>{formId}</code>)? This removes it from the builder. The form ID
          stays available for reuse.
        </p>

        {deleteError && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {deleteError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete Draft"}
          </button>
          <button type="button" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
