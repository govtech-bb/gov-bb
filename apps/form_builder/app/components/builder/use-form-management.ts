import { useConfirmation } from "../ui/dialog/confirmation";
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
  const confirm = useConfirmation();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDisableOpen, setIsDisableOpen] = useState(false);
  const [isEraseOpen, setIsEraseOpen] = useState(false);
  // Retain each target while its dialog animates closed.
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
    setIsDeleteOpen(true);
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
      setIsDeleteOpen(false);
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
    setIsDeleteOpen(false);
  };

  const handleRequestDisable = (form: BuilderFormSummary) => {
    setDisableError(null);
    setDisableTarget(form);
    setIsDisableOpen(true);
    setIsPickerOpen(false);
  };

  const handleConfirmDisable = async (reason: string) => {
    if (!disableTarget) return;
    setIsDisabling(true);
    setDisableError(null);
    try {
      await disableForm({ data: { formId: disableTarget.formId, reason } });
      setIsDisableOpen(false);
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
    setIsDisableOpen(false);
  };

  const handleRequestErase = (form: BuilderFormSummary) => {
    setEraseError(null);
    setEraseSuccess(null);
    setEraseTarget(form);
    setIsEraseOpen(true);
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
    setIsEraseOpen(false);
  };

  // Confirm before restoring the public service.
  const handleEnable = async (form: BuilderFormSummary) => {
    if (
      !(await confirm({
        title: "Restore service?",
        description: `Re-enable ${form.title || form.formId}? The public service will be restored.`,
        confirmLabel: "Re-enable",
      }))
    ) {
      return;
    }
    try {
      await enableForm({ data: { formId: form.formId } });
      refetchForms();
    } catch (e) {
      await confirm({
        title: "Enable failed",
        description: e instanceof Error ? e.message : "Enable failed",
        confirmLabel: "OK",
        cancelLabel: null,
      });
    }
  };

  return {
    isDeleteOpen,
    isDisableOpen,
    isEraseOpen,
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
