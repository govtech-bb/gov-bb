import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContract, ServiceContractRecipe } from "@govtech-bb/form-types";
import type { BuilderFormSummary } from "../../types/index";
import { formPreviewUrl } from "../../lib/form-url";
import { FormPicker } from "./-form-picker";
import { PreviewModal } from "./-preview-modal";
import { SubmitModal } from "./-submit-modal";
import { PublishModal } from "./-publish-modal";
import { FormManagementModals } from "./-form-management-modals";

interface BuilderModalsProps {
  // FormPicker
  isPickerOpen: boolean;
  forms: BuilderFormSummary[] | null;
  formsLoadError: string | null;
  isDirty: boolean;
  catalog: RegistryCatalog;
  onLoad: (draft: RecipeDraft, formId: string) => void;
  onClosePicker: () => void;
  onRequestDelete: (form: BuilderFormSummary) => void;
  onRequestDisable: (form: BuilderFormSummary) => void;
  onRequestErase: (form: BuilderFormSummary) => void;
  onEnable: (form: BuilderFormSummary) => void;
  onDuplicate: (draft: RecipeDraft) => void;

  // PreviewModal
  isPreviewOpen: boolean;
  previewData: ServiceContract | null;
  isPreviewing: boolean;
  previewError: string | null;
  loadedFromId: string | null;
  previewRecipeJson: ServiceContractRecipe | null;
  onClosePreview: () => void;

  // SubmitModal
  isSubmitOpen: boolean;
  draft: RecipeDraft;
  isSubmitting: boolean;
  submitSuccess: boolean;
  submitError: string | null;
  isReadOnly: boolean;
  onSubmit: () => void;
  onCloseSubmit: () => void;

  // PublishModal
  isPublishOpen: boolean;
  baseBranch: string;
  isPublishing: boolean;
  publishSuccess: { prUrl: string; prNumber: number } | null;
  publishError: string | null;
  onPublish: (description: string) => void;
  onClosePublish: () => void;

  // FormManagementModals
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

export function BuilderModals({
  isPickerOpen,
  forms,
  formsLoadError,
  isDirty,
  catalog,
  onLoad,
  onClosePicker,
  onRequestDelete,
  onRequestDisable,
  onRequestErase,
  onEnable,
  onDuplicate,
  isPreviewOpen,
  previewData,
  isPreviewing,
  previewError,
  loadedFromId,
  previewRecipeJson,
  onClosePreview,
  isSubmitOpen,
  draft,
  isSubmitting,
  submitSuccess,
  submitError,
  isReadOnly,
  onSubmit,
  onCloseSubmit,
  isPublishOpen,
  baseBranch,
  isPublishing,
  publishSuccess,
  publishError,
  onPublish,
  onClosePublish,
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
}: BuilderModalsProps) {
  return (
    <>
      {isPickerOpen && (
        <FormPicker
          forms={forms}
          loadError={formsLoadError}
          isDirty={isDirty}
          catalog={catalog}
          onLoad={onLoad}
          onClose={onClosePicker}
          onRequestDelete={onRequestDelete}
          onRequestDisable={onRequestDisable}
          onRequestErase={onRequestErase}
          onEnable={onEnable}
          onDuplicate={onDuplicate}
        />
      )}

      {isPreviewOpen && (
        <PreviewModal
          contract={previewData}
          isLoading={isPreviewing}
          error={previewError}
          previewUrl={loadedFromId ? formPreviewUrl(loadedFromId) : null}
          recipe={previewRecipeJson}
          onClose={onClosePreview}
        />
      )}

      {isSubmitOpen && (
        <SubmitModal
          draft={draft}
          loadedFromId={loadedFromId}
          isSubmitting={isSubmitting}
          submitSuccess={submitSuccess}
          submitError={submitError}
          isReadOnly={isReadOnly}
          onSubmit={onSubmit}
          onClose={onCloseSubmit}
        />
      )}

      {isPublishOpen && (
        <PublishModal
          draft={draft}
          baseBranch={baseBranch}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          publishError={publishError}
          isReadOnly={isReadOnly}
          onPublish={onPublish}
          onClose={onClosePublish}
        />
      )}

      <FormManagementModals
        deleteTarget={deleteTarget}
        isDeleting={isDeleting}
        deleteError={deleteError}
        onConfirmDelete={onConfirmDelete}
        onCloseDelete={onCloseDelete}
        disableTarget={disableTarget}
        isDisabling={isDisabling}
        disableError={disableError}
        onConfirmDisable={onConfirmDisable}
        onCloseDisable={onCloseDisable}
        eraseTarget={eraseTarget}
        isErasing={isErasing}
        eraseError={eraseError}
        eraseSuccess={eraseSuccess}
        onConfirmErase={onConfirmErase}
        onCloseErase={onCloseErase}
      />
    </>
  );
}
