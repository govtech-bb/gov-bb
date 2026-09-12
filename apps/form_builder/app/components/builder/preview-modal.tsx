import { Button } from "../ui/button";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";

import { Dialog } from "../ui/dialog";

interface PreviewModalProps {
  open: boolean;
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
  open,
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
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog size="xl" showCloseButton={false} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title>Preview</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="sm" />}>
            Close
          </Dialog.Close>
        </div>

        <Dialog.Description>
          Review the pages and questions in your current draft. Open the saved
          form to try the applicant journey.
        </Dialog.Description>
        <div className="flex flex-wrap items-center gap-3 border-b border-ui-hairline pb-5">
          {previewUrl ? (
            <a
              className="rounded-lg bg-ui-brand px-4 py-2 text-sm font-medium text-ui-inverse no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-focus"
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview saved form
            </a>
          ) : (
            <p className="text-sm text-ui-subtle">
              Save a draft to preview the applicant journey.
            </p>
          )}
          {recipe && (
            <Button
              type="button"
              onClick={handleViewRecipeJson}
              variant="ghost"
              size="sm"
            >
              View recipe JSON
            </Button>
          )}
        </div>

        {isLoading && <p>Loading preview…</p>}

        {error && (
          <p role="alert" className="text-ui-danger">
            {error}
          </p>
        )}

        {!isLoading && contract && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ui-strong">
                {contract.title}
              </h2>
              <p className="mt-1 text-sm text-ui-subtle">
                {contract.steps.length} pages
              </p>
            </div>
            {contract.steps.map((step, index) => (
              <section
                key={step.stepId}
                className="rounded-lg border border-ui-hairline bg-ui-base p-5"
              >
                <p className="mb-1 text-xs text-ui-subtle">Page {index + 1}</p>
                <h3 className="text-base font-semibold">{step.title}</h3>
                {step.description && (
                  <p className="mt-2 text-sm text-ui-subtle">
                    {step.description}
                  </p>
                )}
                <ol className="mt-4 divide-y divide-ui-hairline">
                  {step.elements.map((field) => (
                    <li key={field.fieldId} className="py-3">
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <span className="font-medium">
                          {field.label || field.fieldId}
                        </span>
                        <span className="text-xs text-ui-subtle">
                          {field.validations?.required?.value
                            ? "Required"
                            : "Optional"}
                        </span>
                      </div>
                      {field.hint && (
                        <p className="mt-1 text-sm text-ui-subtle">
                          {field.hint}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {!isLoading && !contract && <p>No preview data available.</p>}
      </Dialog>
    </Dialog.Root>
  );
}
