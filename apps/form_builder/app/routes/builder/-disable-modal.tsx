import { Banner } from "../../component/ui/banner";
import { InputArea } from "../../component/ui/input/input-area";
import { Button } from "../../component/ui/button";
import { useState } from "react";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../component/ui/dialog";

interface DisableModalProps {
  formId: string;
  title: string;
  isDisabling: boolean;
  disableError: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

// Disable takes a live published service down: the API writes a tombstone, so
// the public site returns 410 Gone. It is reversible (Enable clears it) and the
// on-disk recipe is never touched. A reason is required and audited.
export function DisableModal({
  formId,
  title,
  isDisabling,
  disableError,
  onConfirm,
  onClose,
}: DisableModalProps) {
  const [reason, setReason] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  function handleConfirm() {
    setClientError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setClientError("A reason is required to disable a form.");
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
          <Dialog.Title>Disable Form</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        <p>
          Disable <strong>{title || formId}</strong> (<code>{formId}</code>)?
          The public site will return “Gone” (410) for this service until it is
          re-enabled. No versions are removed and the published recipe is left
          untouched — you can Enable it again at any time.
        </p>

        <div className={styles.formGroup}>
          <InputArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Why is this form being disabled?"
            autoFocus
            label={"Reason"}
          />
        </div>

        {clientError && (
          <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
            <div className="min-w-0 flex-1">{clientError}</div>
          </Banner>
        )}
        {disableError && (
          <Banner variant="error" size="sm" style={{ marginBottom: 8 }}>
            <div className="min-w-0 flex-1">{disableError}</div>
          </Banner>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDisabling}
            size="sm"
          >
            {isDisabling ? "Disabling…" : "Disable Form"}
          </Button>
          <Dialog.Close
            render={
              <Button
                type="button"
                disabled={isDisabling}
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
