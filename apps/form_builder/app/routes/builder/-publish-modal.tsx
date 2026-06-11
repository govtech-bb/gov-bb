import { useState } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface PublishModalProps {
  draft: RecipeDraft;
  version: string | null;
  baseBranch: string;
  isPublishing: boolean;
  publishSuccess: { prUrl: string; prNumber: number } | null;
  publishError: string | null;
  /** Read-only lock (#874): another user holds the editing claim. Warns and
   *  disables Deploy even if the modal was already open when it flipped. */
  isReadOnly?: boolean;
  onPublish: (description: string) => void;
  onClose: () => void;
}

export function PublishModal({
  draft,
  version,
  baseBranch,
  isPublishing,
  publishSuccess,
  publishError,
  isReadOnly = false,
  onPublish,
  onClose,
}: PublishModalProps) {
  const [description, setDescription] = useState("");

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
          <strong>Deploy</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {publishSuccess ? (
          <div className={styles.validationSuccess}>
            <p>
              PR <strong>#{publishSuccess.prNumber}</strong> opened on{" "}
              <code>{baseBranch}</code>.
            </p>
            <p>
              <a
                href={publishSuccess.prUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {publishSuccess.prUrl}
              </a>
            </p>
            <p style={{ marginTop: 8, color: "#666" }}>
              A reviewer must approve and merge it. When merged, the recipe
              becomes available on the next API deploy.
            </p>
          </div>
        ) : (
          <div>
            {isReadOnly && (
              <div className={styles.presenceBanner} role="alert" style={{ marginBottom: 8 }}>
                Another user is currently editing this form. Deploying is
                disabled until their editing session ends.
              </div>
            )}
            <p style={{ color: "#444", marginTop: 0 }}>
              This opens a pull request against <code>{baseBranch}</code> that
              adds{" "}
              <code>
                recipes/{draft.formId}/{version ?? "resolving…"}.json
              </code>
              . The PR is authored by your GitHub account.
            </p>

            <div className={styles.formGroup}>
              <label>Form</label>
              <input type="text" value={draft.title} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label>Form ID</label>
              <input type="text" value={draft.formId} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label>Version</label>
              <input type="text" value={version ?? "resolving…"} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="publish-description">
                PR description (optional)
              </label>
              <textarea
                id="publish-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What changed and why?"
              />
            </div>

            {publishError && (
              <div
                className={styles.validationErrors}
                style={{ marginBottom: 8 }}
              >
                {publishError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => onPublish(description)}
                disabled={isPublishing || version === null || isReadOnly}
              >
                {isPublishing ? "Opening PR…" : "Deploy"}
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
