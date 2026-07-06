import { useState } from "react";
import { deleteForm, disableForm, enableForm } from "../../server/forms";
import { eraseRecipe } from "../../server/publish";
import type { BuilderFormSummary } from "../../types/index";

interface UseFormManagementParams {
  loadedFromId: string | null;
  onClearEditor: () => void;
  refetchForms: () => void;
  setIsPickerOpen: (v: boolean) => void;
}

/**
 * Owns the form-management flows off the Open picker — delete / disable /
 * erase / enable — and their state (targets, loading flags, errors, the erase
 * success PR link). Each of handleRequest* also closes the picker so its
 * modal isn't stacked behind it.
 */
export function useFormManagement({
  loadedFromId,
  onClearEditor,
  refetchForms,
  setIsPickerOpen,
}: UseFormManagementParams) {
  const [deleteTarget, setDeleteTarget] = useState<BuilderFormSummary | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<BuilderFormSummary | null>(
    null,
  );
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [eraseTarget, setEraseTarget] = useState<BuilderFormSummary | null>(
    null,
  );
  const [isErasing, setIsErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [eraseSuccess, setEraseSuccess] = useState<{
    prUrl: string;
    prNumber: number;
  } | null>(null);

  const handleRequestDelete = (form: BuilderFormSummary) => {
    setDeleteError(null);
    setDeleteTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteForm({ data: { formId: deleteTarget.formId } });
      // If the deleted draft is the one open in the editor, clear it.
      if (loadedFromId === deleteTarget.formId) onClearEditor();
      setDeleteTarget(null);
      // The forms list lives in useFormsList (no longer route-loader data), so
      // refetch it directly to drop the deleted entry from the Open picker.
      refetchForms();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDelete = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleRequestDisable = (form: BuilderFormSummary) => {
    setDisableError(null);
    setDisableTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmDisable = async (reason: string) => {
    if (!disableTarget) return;
    setIsDisabling(true);
    setDisableError(null);
    try {
      await disableForm({ data: { formId: disableTarget.formId, reason } });
      setDisableTarget(null);
      // Refetch so the row flips to the Disabled badge + Enable button.
      refetchForms();
    } catch (e) {
      setDisableError(e instanceof Error ? e.message : "Disable failed");
    } finally {
      setIsDisabling(false);
    }
  };

  const handleCloseDisable = () => {
    if (isDisabling) return;
    setDisableTarget(null);
    setDisableError(null);
  };

  const handleRequestErase = (form: BuilderFormSummary) => {
    setEraseError(null);
    setEraseSuccess(null);
    setEraseTarget(form);
    setIsPickerOpen(false);
  };

  const handleConfirmErase = async (reason: string) => {
    if (!eraseTarget) return;
    setIsErasing(true);
    setEraseError(null);
    try {
      const result = await eraseRecipe({
        data: {
          formId: eraseTarget.formId,
          title: eraseTarget.title,
          reason,
        },
      });
      // The recipe stays on disk until the PR merges, so the picker row is left
      // as-is — we surface the PR link in the modal instead of refetching.
      setEraseSuccess(result);
    } catch (e) {
      setEraseError(e instanceof Error ? e.message : "Erase failed");
    } finally {
      setIsErasing(false);
    }
  };

  const handleCloseErase = () => {
    if (isErasing) return;
    setEraseTarget(null);
    setEraseError(null);
    setEraseSuccess(null);
  };

  // Enable is a direct action (no modal) with an inline confirm: clearing a
  // tombstone restores the public service, so a single confirm is enough.
  const handleEnable = async (form: BuilderFormSummary) => {
    if (
      !window.confirm(
        `Re-enable ${form.title || form.formId}? The public service will be restored.`,
      )
    ) {
      return;
    }
    try {
      await enableForm({ data: { formId: form.formId } });
      refetchForms();
    } catch (e) {
      // Surface in the picker's load-error slot via the forms list is overkill;
      // a window.alert keeps the inline action simple and visible.
      window.alert(e instanceof Error ? e.message : "Enable failed");
    }
  };

  return {
    deleteTarget,
    isDeleting,
    deleteError,
    disableTarget,
    isDisabling,
    disableError,
    eraseTarget,
    isErasing,
    eraseError,
    eraseSuccess,
    handleRequestDelete,
    handleConfirmDelete,
    handleCloseDelete,
    handleRequestDisable,
    handleConfirmDisable,
    handleCloseDisable,
    handleRequestErase,
    handleConfirmErase,
    handleCloseErase,
    handleEnable,
  };
}
