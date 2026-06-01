import type { ServiceContract } from "@govtech-bb/form-types";
import styles from "../../styles/builder.module.css";

interface PreviewModalProps {
  contract: ServiceContract | null;
  isLoading: boolean;
  error?: string | null;
  /**
   * Link to the saved recipe on the live forms app, or null when the recipe
   * has never been saved (so there is no DB record to resolve). When set, the
   * modal offers a "Preview saved form" link; otherwise it hints to save first.
   * Note: this previews the *last saved* version, which may lag in-memory edits.
   */
  previewUrl?: string | null;
  onClose: () => void;
}

export function PreviewModal({ contract, isLoading, error, previewUrl, onClose }: PreviewModalProps) {
  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>Preview</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className={styles.formGroup}>
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              🔗 Preview saved form
            </a>
          ) : (
            <span style={{ color: "#888", fontSize: "0.85rem" }}>
              Save this recipe to enable a live preview link.
            </span>
          )}
        </div>

        {isLoading && <p>Loading preview…</p>}

        {error && <p style={{ color: "red" }}>{error}</p>}

        {!isLoading && contract && (
          <div>
            <div className={styles.formGroup}>
              <strong>Form ID:</strong> {contract.formId}
            </div>
            <div className={styles.formGroup}>
              <strong>Title:</strong> {contract.title}
            </div>
            <div className={styles.formGroup}>
              <strong>Version:</strong> {contract.version}
            </div>
            <div className={styles.formGroup}>
              <strong>Steps:</strong> {contract.steps.length}
            </div>

            {contract.steps.map((step) => (
              <div
                key={step.stepId}
                style={{ marginBottom: 16, border: "1px solid #eee", padding: 12, borderRadius: 4 }}
              >
                <div className={styles.sectionTitle}>
                  {step.title} <span className={styles.badge}>{step.stepId}</span>
                </div>
                {step.description && <p style={{ color: "#555" }}>{step.description}</p>}
                {step.elements.map((field) => (
                  <div key={field.fieldId} className={styles.fieldRow}>
                    <span style={{ flex: 1 }}>
                      {field.label} <span className={styles.badge}>{field.htmlType}</span>
                    </span>
                    <span style={{ color: "#888", fontSize: "0.8rem" }}>{field.fieldId}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {!isLoading && !contract && <p>No preview data available.</p>}
      </div>
    </div>
  );
}
