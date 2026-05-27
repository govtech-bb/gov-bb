import { useState } from "react";
import styles from "../../../styles/builder.module.css";

interface DeleteModalProps {
  formId: string;
  title: string;
  isDeleting: boolean;
  deleteError: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function DeleteModal({
  formId,
  title,
  isDeleting,
  deleteError,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleConfirm() {
    setClientError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setClientError("A reason is required to delete a form.");
      return;
    }
    onConfirm(trimmed);
  }

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
          <strong>Delete Form</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p>
          Permanently delete <strong>{title || formId}</strong> (
          <code>{formId}</code>)? Every version is removed and the form ID is
          retired — the public site will return “Gone”. Submitted data is kept.
          This cannot be undone.
        </p>

        <div className={styles.formGroup}>
          <label>Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Why is this form being deleted?"
            autoFocus
          />
        </div>

        {clientError && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {clientError}
          </div>
        )}
        {deleteError && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {deleteError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete Form"}
          </button>
          <button type="button" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
