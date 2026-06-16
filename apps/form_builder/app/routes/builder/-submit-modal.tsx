import { useState } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { validate, compare } from "../../lib/version";
import { formPreviewUrl } from "../../lib/form-url";
import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

interface SubmitModalProps {
  draft: RecipeDraft;
  version: string;
  currentVersion: string | null;
  /**
   * The loaded version is the one in the published index. A published version
   * can't be overwritten in place, so Save Changes cuts a new draft version
   * (`version` is already the bumped patch) rather than overwriting it.
   */
  currentVersionIsPublished?: boolean;
  loadedFromId: string | null;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string | null;
  /** Read-only lock (#874): another user holds the editing claim. Warns and
   *  disables the action even if the modal was already open when it flipped. */
  isReadOnly?: boolean;
  onSubmit: (version: string) => void;
  onClose: () => void;
}

export function SubmitModal({
  draft,
  version: versionProp,
  currentVersion,
  currentVersionIsPublished = false,
  loadedFromId,
  isSubmitting,
  submitSuccess,
  submitError,
  isReadOnly = false,
  onSubmit,
  onClose,
}: SubmitModalProps) {
  const [versionInput, setVersionInput] = useState(versionProp);
  const [clientError, setClientError] = useState<string | null>(null);

  const isUpdate = loadedFromId !== null;
  const mode = isUpdate ? "Save Changes" : "Submit Recipe";

  function handleSubmit() {
    setClientError(null);

    if (!validate(versionInput)) {
      setClientError("Version must be a valid semver (e.g. 1.0.0, major >= 1)");
      return;
    }

    if (isUpdate && currentVersion) {
      if (compare(versionInput, currentVersion) < 0) {
        setClientError(`Version must be the same as or greater than the current version (${currentVersion})`);
        return;
      }
    }

    onSubmit(versionInput);
  }

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
            <div className={styles.formGroup}>
              <label>Version</label>
              <input
                type="text"
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value)}
                // Save Changes overwrites the loaded draft in place at its
                // current version (#329), so the version is pinned and read-only
                // on the update path — Deploy is how a new version is cut. A
                // brand-new form still picks its initial version here.
                readOnly={isUpdate}
              />
              {isUpdate && currentVersionIsPublished && (
                <small className={styles.fieldHint}>
                  v{currentVersion} is published, so Save Changes saves a new
                  draft (v{versionInput}) instead of overwriting it. Use Deploy
                  to publish the new version.
                </small>
              )}
              {isUpdate && !currentVersionIsPublished && (
                <small className={styles.fieldHint}>
                  Save Changes overwrites this draft in place at v{versionInput}.
                  Use Deploy to cut a new version.
                </small>
              )}
            </div>

            {clientError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {clientError}
              </div>
            )}
            {submitError && (
              <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={isSubmitting || isReadOnly}>
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
