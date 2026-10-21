import { useState } from "react";
import { Button } from "../ui/button";
import { useConfirmation } from "../ui/dialog/confirmation";
import { DisableModal } from "../builder/disable-modal";
import { useFormManagement } from "../builder/use-form-management";
import { clearDraft, draftKeyFor } from "../content/draft-store";
import { deleteForm } from "../../server/forms";
import { deleteServiceDraft } from "../../lib/service-drafts";
import type { ServiceRow } from "./service-model";
import type { ServiceState } from "./service-state";

/**
 * Delete a service that has never been published, or disable a published one.
 * A service is published once its form is live or its manifest or any of its
 * pages is in Git; deleting the browser draft then would only orphan live
 * content, so the form is retired through disable instead (as the builder's
 * Open picker does).
 */
export function ServiceDelete({
  service,
  workspace,
  onDeleted,
  onChanged,
}: {
  service: ServiceRow;
  workspace: ServiceState;
  onDeleted: () => Promise<unknown> | void;
  onChanged: () => void;
}) {
  const confirm = useConfirmation();
  const [deleting, setDeleting] = useState(false);
  const manage = useFormManagement({
    loadedFromId: null,
    onClearEditor: () => {},
    refetchForms: onChanged,
    setIsPickerOpen: () => {},
  });
  const draft = workspace.draft!;
  const form = service.form;
  const published =
    !!form?.isPublished ||
    draft.baseManifestSha !== null ||
    draft.pages.some((page) => page.baseSha);

  const remove = async () => {
    // A connected form whose summary didn't load (e.g. listForms failed) can't
    // be proven unpublished, and skipping it would leave it behind as a
    // form-only row once the list recovers. Block until it can be resolved.
    if (!form && (draft.manifest.formId || service.formId)) {
      workspace.setError(
        "The application form could not be loaded, so this service cannot be deleted yet. Reload the page and try again.",
      );
      return;
    }
    if (
      !(await confirm({
        title: "Delete service?",
        description: `Delete ${draft.manifest.title}${form ? " and its application form" : ""}? You cannot undo this. Entry and start pages already on the website are not deleted.`,
        confirmLabel: "Delete service",
        destructive: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      if (form) await deleteForm({ data: { formId: form.formId } });
      // The editor's autosaved copies would list the pages as drafts on this
      // device, bringing the service back into the library.
      for (const page of draft.manifest.pages)
        clearDraft(draftKeyFor(page.path));
      // Leave the workspace first: still on its URL, a stale forms list would
      // adopt the service again as soon as its draft is gone.
      await onDeleted();
      await deleteServiceDraft({
        data: { serviceId: draft.manifest.serviceId },
      });
      onChanged();
    } catch (e) {
      workspace.setError(
        e instanceof Error ? e.message : "The service could not be deleted",
      );
      setDeleting(false);
    }
  };

  if (!published)
    return (
      <Button
        variant="secondary-destructive"
        disabled={deleting}
        onClick={() => void remove()}
      >
        Delete service
      </Button>
    );
  if (!form || form.isDisabled) return null;
  return (
    <>
      <Button
        variant="secondary-destructive"
        onClick={() => manage.handleRequestDisable(form)}
      >
        Disable service
      </Button>
      <DisableModal
        open={manage.isDisableOpen}
        formId={form.formId}
        title={form.title}
        isDisabling={manage.isDisabling}
        disableError={manage.disableError}
        onConfirm={manage.handleConfirmDisable}
        onClose={manage.handleCloseDisable}
      />
    </>
  );
}
