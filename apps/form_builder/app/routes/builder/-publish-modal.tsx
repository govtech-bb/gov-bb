import { useState } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import type { RecipeValidateResponse } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";

interface PublishModalProps {
  draft: RecipeDraft;
  version: string;
  validateResult: RecipeValidateResponse | null;
  isPublishing: boolean;
  publishResult: { prUrl: string; prNumber: number } | null;
  publishError: string | null;
  canPublish: boolean;
  onPublish: (prDescription: string) => void;
  onClose: () => void;
}

export function PublishModal({
  draft,
  version,
  validateResult,
  isPublishing,
  publishResult,
  publishError,
  canPublish,
  onPublish,
  onClose,
}: PublishModalProps) {
  const defaultDescription = `Publishes ${draft.formId} v${version} via Form Builder`;
  const [description, setDescription] = useState(defaultDescription);

  const validationIssues = validateResult && !validateResult.valid
    ? validateResult.issues
    : [];

  return (
    <div className={styles.modal} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <strong>Publish via GitHub</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {publishResult ? (
          <div className={styles.validationSuccess}>
            <p style={{ marginBottom: 8 }}>
              Pull request opened — review and merge to deploy.
            </p>
            <a
              href={publishResult.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnPrimary}
              style={{ display: "inline-block", padding: "6px 12px" }}
            >
              Open PR #{publishResult.prNumber} ↗
            </a>
          </div>
        ) : (
          <div>
            <div className={styles.formGroup}>
              <label>Form ID</label>
              <input type="text" value={draft.formId} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label>Title</label>
              <input type="text" value={draft.title} readOnly />
            </div>
            <div className={styles.formGroup}>
              <label>Version</label>
              <input type="text" value={version} readOnly />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="publish-pr-description">PR description</label>
              <textarea
                id="publish-pr-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                style={{ width: "100%", fontFamily: "inherit" }}
              />
            </div>

            {validationIssues.length > 0 && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                <strong>Cannot publish — validation issues:</strong>
                <ul>
                  {validationIssues.map((issue, i) => (
                    <li key={i}>
                      {issue.path && <code>{issue.path}</code>}{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!canPublish && validationIssues.length === 0 && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                You are not in the configured publish team. Ask an
                administrator to add you, or sign in as a publisher.
              </div>
            )}

            {publishError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {publishError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => onPublish(description)}
                disabled={
                  !canPublish ||
                  isPublishing ||
                  validationIssues.length > 0
                }
              >
                {isPublishing ? "Opening PR…" : "Publish"}
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
