import { useState } from "react";
import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

interface DisableModalProps {
  formId: string;
  title: string;
  isDisabling: boolean;
  disableError: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

// Disable takes a live published service down: the API writes a tombstone, so
// the public site returns 410 Gone. It is reversible (Enable clears it) and the
// on-disk recipe is never touched. A reason is required and audited.
export function DisableModal({
  formId,
  title,
  isDisabling,
  disableError,
  onConfirm,
  onClose,
}: DisableModalProps) {
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleConfirm() {
    setClientError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setClientError("A reason is required to disable a form.");
      return;
    }
    onConfirm(trimmed);
  }

  useEscClose(onClose);

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} role="dialog" aria-modal="true" aria-label="Disable Form" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <strong>Disable Form</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <p>
          Disable <strong>{title || formId}</strong> (<code>{formId}</code>)?
          The public site will return “Gone” (410) for this service until it is
          re-enabled. No versions are removed and the published recipe is left
          untouched — you can Enable it again at any time.
        </p>

        <div className={styles.formGroup}>
          <label>Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Why is this form being disabled?"
            autoFocus
          />
        </div>

        {clientError && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {clientError}
          </div>
        )}
        {disableError && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {disableError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={styles.btnDanger}
            onClick={handleConfirm}
            disabled={isDisabling}
          >
            {isDisabling ? "Disabling…" : "Disable Form"}
          </button>
          <button type="button" onClick={onClose} disabled={isDisabling}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
