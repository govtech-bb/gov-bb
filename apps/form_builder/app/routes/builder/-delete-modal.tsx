import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

interface DeleteModalProps {
  formId: string;
  title: string;
  /**
   * The form is published (#2411). The rows being deleted are then the
   * builder's working copy shadowing the committed recipe — not the form —
   * so the copy has to say so.
   */
  isPublished?: boolean;
  isDeleting: boolean;
  deleteError: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

// A light confirm for deleting a form's form_definitions rows. No tombstone is
// written and no reason is collected.
//
// Two cases, one action. For an unpublished draft this removes the form from
// the builder and frees the ID. For a published form the only rows are the
// builder's working copy — the published artifact is the committed recipe file,
// which apps/api serves — so deleting them just stops the copy from shadowing
// it (retiring a published form is Disable, not this).
export function DeleteModal({
  formId,
  title,
  isPublished = false,
  isDeleting,
  deleteError,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  useEscClose(onClose);
  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} role="dialog" aria-modal="true" aria-label={isPublished ? "Delete working copy" : "Delete Draft"} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <strong>{isPublished ? "Delete working copy" : "Delete Draft"}</strong>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        {isPublished ? (
          <>
            <p>
              Delete the builder&rsquo;s saved working copy of{" "}
              <strong>{title || formId}</strong> (<code>{formId}</code>)? The
              builder will fall back to the recipe committed in the repository,
              so a recipe edited there becomes visible here again.
            </p>
            <p>
              <strong>Any unpublished builder edits to this form are lost.</strong>{" "}
              The live service, its submissions, and its per-environment config
              (contact, payment processors) are not affected.
            </p>
          </>
        ) : (
          <p>
            Delete the draft <strong>{title || formId}</strong> (
            <code>{formId}</code>)? This removes it from the builder. The form ID
            stays available for reuse.
          </p>
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
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? "Deleting…"
              : isPublished
                ? "Delete working copy"
                : "Delete Draft"}
          </button>
          <button type="button" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
