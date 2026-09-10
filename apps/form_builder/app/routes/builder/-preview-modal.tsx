import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import styles from "../../styles/builder.module.css";
import { Dialog } from "../../components/ui/dialog";

interface PreviewModalProps {
  contract: ServiceContract | null;
  isLoading: boolean;
  error?: string | null;
  /**
   * Link to the saved recipe on the live forms app, or null when the recipe
   * has never been saved (so there is no DB record to resolve). When set, the
   * modal offers a "Preview saved form" link; otherwise it hints to save first.
   * Note: this previews the *last saved* version, which may lag in-memory edits.
   */
  previewUrl?: string | null;
  /**
   * The serialized in-memory recipe captured when Preview was pressed — the
   * exact payload Save draft / Deploy would persist (#744). When set, the
   * modal offers a "View recipe JSON" action that opens it in a new tab.
   */
  recipe?: ServiceContractRecipe | null;
  onClose: () => void;
}

export function PreviewModal({
  contract,
  isLoading,
  error,
  previewUrl,
  recipe,
  onClose,
}: PreviewModalProps) {
  // Opens the captured recipe as pretty-printed JSON in a new tab via a blob
  // URL — purely client-side, since the draft may never have been saved. The
  // blob URL is revoked on a delay: the new tab reads it at open time, after
  // which the URL is no longer needed, but revoking synchronously would race
  // the navigation.
  const handleViewRecipeJson = () => {
    if (!recipe) return;
    const blob = new Blob([JSON.stringify(recipe, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <Dialog.Root
      defaultOpen
      onOpenChangeComplete={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog size="xl" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Preview</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        <div
          className={styles.formGroup}
          style={{ display: "flex", gap: 16, alignItems: "center" }}
        >
          {previewUrl ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              🔗 Preview saved form
            </a>
          ) : (
            <span style={{ color: "var(--ui-subtle)", fontSize: "0.85rem" }}>
              Save this recipe to enable a live preview link.
            </span>
          )}
          {recipe && (
            <Button
              type="button"
              onClick={handleViewRecipeJson}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--ui-link)",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: "inherit",
              }}
              variant="secondary"
              size="sm"
            >
              {"{} "}View recipe JSON
            </Button>
          )}
        </div>

        {isLoading && <p>Loading preview…</p>}

        {error && <p style={{ color: "var(--ui-danger-text)" }}>{error}</p>}

        {!isLoading && contract && (
          <div>
            <div className={styles.formGroup}>
              <strong>Form ID:</strong> {contract.formId}
            </div>
            <div className={styles.formGroup}>
              <strong>Title:</strong> {contract.title}
            </div>
            <div className={styles.formGroup}>
              <strong>Version:</strong> {contract.version}
            </div>
            <div className={styles.formGroup}>
              <strong>Steps:</strong> {contract.steps.length}
            </div>

            {contract.steps.map((step) => (
              <div
                key={step.stepId}
                style={{
                  marginBottom: 16,
                  border: "1px solid var(--ui-hairline)",
                  padding: 12,
                  borderRadius: 4,
                }}
              >
                <div className={styles.sectionTitle}>
                  {step.title} <Badge variant="secondary">{step.stepId}</Badge>
                </div>
                {step.description && (
                  <p style={{ color: "var(--ui-subtle)" }}>
                    {step.description}
                  </p>
                )}
                {step.elements.map((field) => (
                  <div key={field.fieldId} className={styles.fieldRow}>
                    <span style={{ flex: 1 }}>
                      {field.label}{" "}
                      <Badge variant="secondary">{field.htmlType}</Badge>
                    </span>
                    <span
                      style={{ color: "var(--ui-subtle)", fontSize: "0.8rem" }}
                    >
                      {field.fieldId}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {!isLoading && !contract && <p>No preview data available.</p>}
      </Dialog>
    </Dialog.Root>
  );
}
