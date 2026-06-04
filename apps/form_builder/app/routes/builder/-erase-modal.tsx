import { useState } from "react";
import styles from "../../styles/builder.module.css";

interface EraseModalProps {
  formId: string;
  title: string;
  isErasing: boolean;
  eraseSuccess: { prUrl: string; prNumber: number } | null;
  eraseError: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

// Erase is the inverse of Deploy: it opens a review PR that permanently removes
// the form's on-disk recipe folder. Unlike Disable (a reversible runtime
// tombstone), Erase is destructive — it deletes the published recipe from the
// repo. It still goes through human review/merge, never the base branch
// directly. A reason is required and flows into the PR body for audit.
export function EraseModal({
  formId,
  title,
  isErasing,
  eraseSuccess,
  eraseError,
  onConfirm,
  onClose,
}: EraseModalProps) {
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleConfirm() {
    setClientError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setClientError("A reason is required to erase a form.");
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
          <strong>Erase Form</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {eraseSuccess ? (
          <div className={styles.validationSuccess}>
            <p>
              PR <strong>#{eraseSuccess.prNumber}</strong> opened to erase{" "}
              <strong>{title || formId}</strong> (<code>{formId}</code>).
            </p>
            <p>
              <a
                href={eraseSuccess.prUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {eraseSuccess.prUrl}
              </a>
            </p>
            <p style={{ marginTop: 8, color: "#666" }}>
              A reviewer must approve and merge it. The recipe stays on disk
              until the PR merges.
            </p>
          </div>
        ) : (
          <>
            <p>
              Erase <strong>{title || formId}</strong> (<code>{formId}</code>)?
              This opens a pull request that permanently deletes this
              form&rsquo;s on-disk recipe folder. Unlike Disable, this is not a
              runtime toggle — once the PR merges the published recipe is gone
              from the repo. The change still goes through review before it
              takes effect.
            </p>

            <div className={styles.formGroup}>
              <label>Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Why is this form being erased?"
                autoFocus
              />
            </div>

            {clientError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {clientError}
              </div>
            )}
            {eraseError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {eraseError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.btnErase}
                onClick={handleConfirm}
                disabled={isErasing}
              >
                {isErasing ? "Opening PR…" : "Erase Form"}
              </button>
              <button type="button" onClick={onClose} disabled={isErasing}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
