import { Collapsible } from "../ui/collapsible";
import { Banner } from "../ui/banner";
import { InputArea } from "../ui/input/input-area";
import { Button } from "../ui/button";
import { useState } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";

import { Dialog } from "../ui/dialog";

interface PublishModalProps {
  open: boolean;
  draft: RecipeDraft;
  baseBranch: string;
  isPublishing: boolean;
  // #2390: updatedExistingPR distinguishes a fresh PR from a push onto one
  // already open for this form, so the success copy below can say which
  // happened.
  publishSuccess: {
    prUrl: string;
    prNumber: number;
    updatedExistingPR: boolean;
  } | null;
  publishError: string | null;
  /** Read-only lock (#874): another user holds the editing claim. Warns and
   *  disables Deploy even if the modal was already open when it flipped. */
  isReadOnly?: boolean;
  onPublish: (description: string) => void;
  onClose: () => void;
}

export function PublishModal({
  open,
  draft,
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
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          setDescription("");
        }
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Publish form</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        {publishSuccess ? (
          <Banner variant="success" size="sm">
            <div className="min-w-0 flex-1">
              <p>
                {publishSuccess.updatedExistingPR ? (
                  // #2390: this form already had a Deploy PR in review, so the
                  // recipe was pushed onto it instead of opening a duplicate
                  // that would conflict with it on the same recipe file.
                  <>
                    Updated review <strong>#{publishSuccess.prNumber}</strong>{" "}
                    with your latest changes.
                  </>
                ) : (
                  <>
                    Review <strong>#{publishSuccess.prNumber}</strong> opened on{" "}
                    <code>{baseBranch}</code>.
                  </>
                )}
              </p>
              <p>
                <a
                  href={publishSuccess.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open review #{publishSuccess.prNumber}
                </a>
              </p>
              <p className="mt-3 text-ui-subtle">
                A reviewer must approve and merge it. When merged, the recipe
                becomes available on the next API deploy.
              </p>
            </div>
          </Banner>
        ) : (
          <div>
            {isReadOnly && (
              <Banner variant="alert" size="sm" role="alert" className="mb-4">
                <div className="min-w-0 flex-1">
                  Another user is currently editing this form. Publishing is
                  disabled until their editing session ends.
                </div>
              </Banner>
            )}
            <Dialog.Description className="mb-5">
              Send <strong>{draft.title || "Untitled form"}</strong> for review.
              Once approved and merged, the changes become available with the
              next release.
            </Dialog.Description>
            <Collapsible.Root className="mb-5 rounded-lg border border-ui-hairline px-4 py-3 text-sm">
              <Collapsible.DefaultTrigger className="cursor-pointer font-medium">
                Publication details
              </Collapsible.DefaultTrigger>
              <Collapsible.Panel keepMounted>
                <p className="mt-3 text-ui-subtle wrap-anywhere">
                  A pull request from your GitHub account updates{" "}
                  <code>recipes/{draft.formId}.json</code> on{" "}
                  <code>{baseBranch}</code>.
                </p>
              </Collapsible.Panel>
            </Collapsible.Root>
            <div className="mb-5 flex flex-col gap-1.5">
              <label htmlFor="publish-description">
                Description for the reviewer (optional)
              </label>
              <InputArea
                id="publish-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What changed and why?"
              />
            </div>

            {publishError && (
              <Banner variant="error" size="sm" className="mb-4">
                <div className="min-w-0 flex-1">{publishError}</div>
              </Banner>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => onPublish(description)}
                disabled={isPublishing || isReadOnly}
                size="sm"
              >
                {isPublishing ? "Sending…" : "Send for review"}
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
