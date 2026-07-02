import { DeleteModal } from "./-delete-modal";
import { DisableModal } from "./-disable-modal";
import { EraseModal } from "./-erase-modal";
import type { BuilderFormSummary } from "../../types/index";

interface FormManagementModalsProps {
  deleteTarget: BuilderFormSummary | null;
  isDeleting: boolean;
  deleteError: string | null;
  onConfirmDelete: () => void;
  onCloseDelete: () => void;
  disableTarget: BuilderFormSummary | null;
  isDisabling: boolean;
  disableError: string | null;
  onConfirmDisable: (reason: string) => void;
  onCloseDisable: () => void;
  eraseTarget: BuilderFormSummary | null;
  isErasing: boolean;
  eraseError: string | null;
  eraseSuccess: { prUrl: string; prNumber: number } | null;
  onConfirmErase: (reason: string) => void;
  onCloseErase: () => void;
}

export function FormManagementModals({
  deleteTarget,
  isDeleting,
  deleteError,
  onConfirmDelete,
  onCloseDelete,
  disableTarget,
  isDisabling,
  disableError,
  onConfirmDisable,
  onCloseDisable,
  eraseTarget,
  isErasing,
  eraseError,
  eraseSuccess,
  onConfirmErase,
  onCloseErase,
}: FormManagementModalsProps) {
  return (
    <>
      {deleteTarget && (
        <DeleteModal
          formId={deleteTarget.formId}
          title={deleteTarget.title}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onConfirm={onConfirmDelete}
          onClose={onCloseDelete}
        />
      )}

      {disableTarget && (
        <DisableModal
          formId={disableTarget.formId}
          title={disableTarget.title}
          isDisabling={isDisabling}
          disableError={disableError}
          onConfirm={onConfirmDisable}
          onClose={onCloseDisable}
        />
      )}

      {eraseTarget && (
        <EraseModal
          formId={eraseTarget.formId}
          title={eraseTarget.title}
          isErasing={isErasing}
          eraseSuccess={eraseSuccess}
          eraseError={eraseError}
          onConfirm={onConfirmErase}
          onClose={onCloseErase}
        />
      )}
    </>
  );
}
