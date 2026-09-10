import { Banner } from "../../component/ui/banner";
import { Input } from "../../component/ui/input";
import { Button } from "../../component/ui/button";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { formPreviewUrl } from "../../lib/form-url";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../component/ui/dialog";

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

  return (
    <Dialog.Root
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>{mode}</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        {submitSuccess ? (
          <Banner variant="success" size="sm">
            <div className="min-w-0 flex-1">
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
          </Banner>
        ) : (
          <div>
            {isReadOnly && (
              <Banner
                variant="alert"
                size="sm"
                role="alert"
                style={{ marginBottom: 8 }}
              >
                <div className="min-w-0 flex-1">
                  Another user is currently editing this form. Saving is
                  disabled until their editing session ends.
                </div>
              </Banner>
            )}
            <div className={styles.formGroup}>
              <Input
                type="text"
                value={draft.formId}
                readOnly
                label={"Form ID"}
                className="w-full min-w-0"
              />
            </div>
            <div className={styles.formGroup}>
              <Input
                type="text"
                value={draft.title}
                readOnly
                label={"Title"}
                className="w-full min-w-0"
              />
            </div>

            {submitError && (
              <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
                <div className="min-w-0 flex-1">{submitError}</div>
              </Banner>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant="primary"
                onClick={onSubmit}
                disabled={isSubmitting || isReadOnly}
                size="sm"
              >
                {isSubmitting ? "Submitting…" : mode}
              </Button>
              <Dialog.Close
                render={<Button type="button" variant="secondary" size="sm" />}
              >
                Cancel
              </Dialog.Close>
            </div>
          </div>
        )}
      </Dialog>
    </Dialog.Root>
  );
}
