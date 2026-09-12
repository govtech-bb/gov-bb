import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { formPreviewUrl } from "../../lib/form-url";

import { Dialog } from "../ui/dialog";

interface SubmitModalProps {
  open: boolean;
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
  open,
  draft,
  isSubmitting,
  submitSuccess,
  submitError,
  isReadOnly = false,
  onSubmit,
  onClose,
}: SubmitModalProps) {
  const mode = "Save draft";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
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
              Draft saved.
              <div className="mt-2">
                <a
                  href={formPreviewUrl(draft.formId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preview form
                </a>
              </div>
            </div>
          </Banner>
        ) : (
          <div>
            {isReadOnly && (
              <Banner variant="alert" size="sm" role="alert" className="mb-4">
                <div className="min-w-0 flex-1">
                  Another user is currently editing this form. Saving is
                  disabled until their editing session ends.
                </div>
              </Banner>
            )}
            <Dialog.Description className="mb-5">
              Save your changes to{" "}
              <strong>{draft.title || "Untitled form"}</strong>. The published
              form stays as it is until you publish an update.
            </Dialog.Description>

            {submitError && (
              <Banner variant="error" size="sm" className="mb-4">
                <div className="min-w-0 flex-1">{submitError}</div>
              </Banner>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={onSubmit}
                disabled={isSubmitting || isReadOnly}
                size="sm"
              >
                {isSubmitting ? "Saving…" : mode}
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
