import { Banner } from "../../component/ui/banner";
import { InputArea } from "../../component/ui/input/input-area";
import { Input } from "../../component/ui/input";
import { Button } from "../../component/ui/button";
import { useState } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../component/ui/dialog";

interface PublishModalProps {
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
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Deploy</Dialog.Title>
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
                    Pushed to the already-open PR{" "}
                    <strong>#{publishSuccess.prNumber}</strong> for this form —
                    no duplicate PR was created.
                  </>
                ) : (
                  <>
                    PR <strong>#{publishSuccess.prNumber}</strong> opened on{" "}
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
                  {publishSuccess.prUrl}
                </a>
              </p>
              <p style={{ marginTop: 8, color: "var(--ui-subtle)" }}>
                A reviewer must approve and merge it. When merged, the recipe
                becomes available on the next API deploy.
              </p>
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
                  Another user is currently editing this form. Deploying is
                  disabled until their editing session ends.
                </div>
              </Banner>
            )}
            <p style={{ color: "var(--ui-default)", marginTop: 0 }}>
              This opens a pull request against <code>{baseBranch}</code> that
              overwrites <code>recipes/{draft.formId}.json</code>. The PR is
              authored by your GitHub account.
            </p>

            <div className={styles.formGroup}>
              <Input
                type="text"
                value={draft.title}
                readOnly
                label={"Form"}
                className="w-full min-w-0"
              />
            </div>
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
              <label htmlFor="publish-description">
                PR description (optional)
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
              <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
                <div className="min-w-0 flex-1">{publishError}</div>
              </Banner>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant="primary"
                onClick={() => onPublish(description)}
                disabled={isPublishing || isReadOnly}
                size="sm"
              >
                {isPublishing ? "Opening PR…" : "Deploy"}
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
