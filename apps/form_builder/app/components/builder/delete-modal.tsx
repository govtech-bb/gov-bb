import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

interface DeleteModalProps {
  open: boolean;
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
  open,
  formId,
  title,
  isPublished = false,
  isDeleting,
  deleteError,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (!next && isDeleting) {
          details.cancel();
          return;
        }
        if (!next) onClose();
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>
            {isPublished ? "Delete working copy" : "Delete Draft"}
          </Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
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
              <strong>
                Any unpublished builder edits to this form are lost.
              </strong>{" "}
              The live service, its submissions, and its per-environment config
              (contact, payment processors) are not affected.
            </p>
          </>
        ) : (
          <p>
            Delete the draft <strong>{title || formId}</strong> (
            <code>{formId}</code>)? This removes it from the builder. The form
            ID stays available for reuse.
          </p>
        )}

        {deleteError && (
          <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
            <div className="min-w-0 flex-1">{deleteError}</div>
          </Banner>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            size="sm"
          >
            {isDeleting
              ? "Deleting…"
              : isPublished
                ? "Delete working copy"
                : "Delete Draft"}
          </Button>
          <Dialog.Close
            render={
              <Button
                type="button"
                disabled={isDeleting}
                variant="secondary"
                size="sm"
              />
            }
          >
            Cancel
          </Dialog.Close>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
