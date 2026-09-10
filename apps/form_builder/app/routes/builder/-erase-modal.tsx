import { Banner } from "../../component/ui/banner";
import { InputArea } from "../../component/ui/input/input-area";
import { Button } from "../../component/ui/button";
import { useState } from "react";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../component/ui/dialog";

interface EraseModalProps {
  formId: string;
  title: string;
  isErasing: boolean;
  eraseSuccess: { prUrl: string; prNumber: number } | null;
  eraseError: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

// Erase is the inverse of Deploy: it opens a review PR that permanently removes
// the form's on-disk recipe folder. Unlike Disable (a reversible runtime
// tombstone), Erase is destructive — it deletes the published recipe from the
// repo. It still goes through human review/merge, never the base branch
// directly. A reason is required and flows into the PR body for audit.
export function EraseModal({
  formId,
  title,
  isErasing,
  eraseSuccess,
  eraseError,
  onConfirm,
  onClose,
}: EraseModalProps) {
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleConfirm() {
    setClientError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setClientError("A reason is required to erase a form.");
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Dialog.Root
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog size="lg" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Erase Form</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        {eraseSuccess ? (
          <Banner variant="success" size="sm">
            <div className="min-w-0 flex-1">
              <p>
                PR <strong>#{eraseSuccess.prNumber}</strong> opened to erase{" "}
                <strong>{title || formId}</strong> (<code>{formId}</code>).
              </p>
              <p>
                <a
                  href={eraseSuccess.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {eraseSuccess.prUrl}
                </a>
              </p>
              <p style={{ marginTop: 8, color: "var(--ui-subtle)" }}>
                A reviewer must approve and merge it. The recipe stays on disk
                until the PR merges.
              </p>
            </div>
          </Banner>
        ) : (
          <>
            <p>
              Erase <strong>{title || formId}</strong> (<code>{formId}</code>)?
              This opens a pull request that permanently deletes this
              form&rsquo;s on-disk recipe folder. Unlike Disable, this is not a
              runtime toggle — once the PR merges the published recipe is gone
              from the repo. The change still goes through review before it
              takes effect.
            </p>

            <div className={styles.formGroup}>
              <InputArea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Why is this form being erased?"
                autoFocus
                label={"Reason"}
              />
            </div>

            {clientError && (
              <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
                <div className="min-w-0 flex-1">{clientError}</div>
              </Banner>
            )}

            {eraseError && (
              <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
                <div className="min-w-0 flex-1">{eraseError}</div>
              </Banner>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirm}
                disabled={isErasing}
                size="sm"
              >
                {isErasing ? "Opening PR…" : "Erase Form"}
              </Button>
              <Dialog.Close
                render={
                  <Button
                    type="button"
                    disabled={isErasing}
                    variant="secondary"
                    size="sm"
                  />
                }
              >
                Cancel
              </Dialog.Close>
            </div>
          </>
        )}
      </Dialog>
    </Dialog.Root>
  );
}
