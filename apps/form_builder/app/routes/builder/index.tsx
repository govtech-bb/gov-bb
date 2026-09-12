import { useGlobalAssistant } from "../../components/global-assistant";
import { ListChecksIcon } from "@phosphor-icons/react";
import { useConfirmation } from "../../components/ui/dialog/confirmation";
import "../../styles/builder.global.css";
import {
  createFileRoute,
  useBlocker,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import {
  useReducer,
  useState,
  useMemo,
  useEffect,
  useEffectEvent,
} from "react";
import { listForms } from "../../server/forms";
import { getCatalogFn } from "../../server/registry";
import { createMdaContact } from "../../server/mda-contacts";
import { getPublishBaseBranch } from "../../server/publish";
import { previewRecipe } from "../../server/registry";
import {
  serializeRecipeDraft,
  findRecipeIdCollisions,
  resolveFieldIds,
} from "@govtech-bb/form-builder";
import type {
  ServiceContract,
  ServiceContractRecipe,
  RecipeVisibility,
} from "@govtech-bb/form-types";
import { getRecipeVisibility } from "@govtech-bb/form-types";
import type { RecipeDraft } from "@govtech-bb/form-builder";

import { Sidebar } from "../../components/ui/sidebar";

import { AppShell } from "../../components/app-shell";
import { useContentList } from "../../components/content/use-content-list";
import {
  useServiceIndex,
  mergeServiceRows,
} from "../../components/services/service-state";
import { buildServiceRows } from "../../components/services/service-model";
import { draftsEqual } from "../../components/builder/apply-recipe";
import { FormAssistant } from "../../components/builder/form-assistant";
import {
  recipeReducer,
  EMPTY_DRAFT,
  nextStepId,
  REQUIRED_STEP_IDS,
  firstStepId,
} from "../../components/builder/recipe-reducer";
import { ServicePreview } from "../../components/services/service-preview";
import { getServiceDraft } from "../../lib/service-drafts";
import type { ServiceDraft, ServiceSnapshot } from "@govtech-bb/form-types";
import { extractDbProcessors } from "@govtech-bb/form-builder";
import { loadFormWorkspace } from "../../components/builder/load-form-draft";
import { Toolbar } from "../../components/builder/toolbar";
import { usePresence } from "../../components/builder/use-presence";
import { PresenceBanner } from "../../components/builder/presence-banner";
import { StepList } from "../../components/builder/step-list";
import { duplicateStepDraft } from "../../components/builder/duplicate";
import { BuilderPanel } from "../../components/builder/builder-panel";
import { CollisionBanner } from "../../components/builder/collision-banner";
import { FormPicker } from "../../components/builder/form-picker";
import { PreviewModal } from "../../components/builder/preview-modal";
import { SubmitModal } from "../../components/builder/submit-modal";
import { PublishModal } from "../../components/builder/publish-modal";
import { DeleteModal } from "../../components/builder/delete-modal";
import { DisableModal } from "../../components/builder/disable-modal";
import { EraseModal } from "../../components/builder/erase-modal";
import { isValidSlug } from "../../lib/content";
import { formPreviewUrl } from "../../lib/form-url";
import { ValidationPanel } from "../../components/builder/validation-panel";
import {
  checkFormUniqueness,
  checkRekeyPublished,
} from "../../components/builder/form-uniqueness";
import { useFormsList } from "../../components/builder/use-forms-list";
import { useMdaContacts } from "../../components/builder/use-mda-contacts";
import { useRecipeValidation } from "../../components/builder/use-recipe-validation";
import { useRecipeSave } from "../../components/builder/use-recipe-save";
import { useDraftLifecycle } from "../../components/builder/use-draft-lifecycle";
import { useFormManagement } from "../../components/builder/use-form-management";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";

export const Route = createFileRoute("/builder/")({
  validateSearch: (
    search,
  ): {
    formId?: string;
    picker?: boolean;
    newFormId?: string;
    title?: string;
    service?: string;
    step?: string;
    focus?: "logic";
    view?: "processors" | "contactDetails";
  } => ({
    newFormId:
      typeof search.newFormId === "string" && isValidSlug(search.newFormId)
        ? search.newFormId
        : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
    service: typeof search.service === "string" ? search.service : undefined,
    step: typeof search.step === "string" ? search.step : undefined,
    focus: search.focus === "logic" ? "logic" : undefined,
    view:
      search.view === "processors" || search.view === "contactDetails"
        ? search.view
        : undefined,
    formId:
      typeof search.formId === "string" && search.formId.trim()
        ? search.formId
        : undefined,
    picker: search.picker === true || search.picker === "true" || undefined,
  }),
  beforeLoad: ({ search, context }) => {
    if (!search.formId && !search.newFormId && !search.picker)
      throw redirect({ to: "/services", search: {} });
    return context;
  },
  loaderDeps: ({ search }) => ({
    formId: search.formId,
    service: search.service,
    newFormId: search.newFormId,
    view: search.view,
  }),
  // The catalog is needed for the first render (StepEditor, the duplicate-ID
  // memo) and is cheap thanks to its 60s server cache. The base branch is a
  // tiny env-var read resolved server-side (it can't be read from the client
  // bundle), so it rides along here. The forms list is a slow, uncached
  // GitHub-API waterfall consumed only by the Open picker, so it stays off the
  // critical path via useFormsList.
  loader: async ({ deps }) => {
    const [catalog, baseBranch] = await Promise.all([
      getCatalogFn(),
      getPublishBaseBranch(),
    ]);
    const formId =
      deps.formId ??
      (deps.newFormId &&
      (await listForms()).some((form) => form.formId === deps.newFormId)
        ? deps.newFormId
        : undefined);
    const serviceId =
      deps.service && !deps.service.includes(":") ? deps.service : undefined;
    const loaded = formId
      ? await loadFormWorkspace(formId, catalog, serviceId)
      : null;
    const initialService =
      loaded?.serviceDraft ??
      (serviceId ? await getServiceDraft({ data: { serviceId } }) : null);
    if (deps.view === "processors" && initialService) {
      throw redirect({
        to: "/services",
        search: {
          service: initialService.manifest.serviceId,
          tab: "delivery",
          setup: "actions",
        },
        replace: true,
      });
    }
    return {
      catalog,
      baseBranch,
      initialDraft: loaded?.draft ?? null,
      initialService,
      initialFormId: formId,
    };
  },
  ssr: false,
  component: BuilderRoute,
});

function BuilderRoute() {
  const search = Route.useSearch();
  return (
    <BuilderPage
      key={`${search.service ?? ""}:${search.formId ?? search.newFormId ?? "picker"}`}
    />
  );
}

function BuilderPage() {
  const confirm = useConfirmation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = Route.useRouteContext();
  const { catalog, baseBranch, initialDraft, initialFormId, initialService } =
    Route.useLoaderData();
  const {
    forms,
    loadError: formsLoadError,
    openPRs: formOpenPRs,
    refetch: refetchForms,
    upsertForm,
  } = useFormsList();
  // Per-environment MDA contact directory (issue #607), consumed by the
  // contact-details dropdown.
  const {
    contacts: mdaContacts,
    loadError: mdaContactsLoadError,
    upsertContact: upsertMdaContact,
  } = useMdaContacts();
  const newDraft = useMemo(
    () =>
      search.newFormId
        ? {
            ...EMPTY_DRAFT,
            formId: search.newFormId,
            title: search.title ?? "",
          }
        : undefined,
    [search.newFormId, search.title],
  );
  const serviceKey =
    search.service ?? (search.formId ? `form:${search.formId}` : undefined);
  const scopedFormId =
    search.formId ??
    search.newFormId ??
    (serviceKey?.startsWith("form:") ? serviceKey.slice(5) : undefined);
  const [draft, dispatch] = useReducer(
    recipeReducer,
    initialDraft,
    (initial) =>
      initial
        ? recipeReducer(EMPTY_DRAFT, { type: "LOAD_DRAFT", draft: initial })
        : (newDraft ?? EMPTY_DRAFT),
  );
  // Snapshot of the last saved/loaded draft — the baseline that "unsaved
  // changes" is measured against. null for a brand-new form (no save/load yet);
  // set on load, on save-success, and back to null on New.
  const [savedDraft, setSavedDraft] = useState<RecipeDraft | null>(() =>
    initialDraft ? draft : null,
  );

  const [serviceDraft, setServiceDraft] = useState<ServiceDraft | null>(
    initialService ?? null,
  );
  const [servicePreview, setServicePreview] = useState<ServiceSnapshot | null>(
    null,
  );
  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    () => search.step ?? (initialDraft ? firstStepId(initialDraft) : null),
  );
  // Which view the main area shows. Processors and contact details are
  // form-scoped, so they each get a sibling view to the per-step editor rather
  // than living inside a step.
  const [mainView, setMainView] = useState<
    "step" | "processors" | "contactDetails"
  >(search.view ?? "step");
  useEffect(() => {
    if (search.step) {
      setSelectedStepId(search.step);
      setMainView("step");
    } else if (search.view) setMainView(search.view);
  }, [search.step, search.view]);
  const [loadedFromId, setLoadedFromId] = useState<string | null>(
    initialFormId ?? null,
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceContract | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // The serialized draft captured when Preview is pressed (#744) — set before
  // the preview request so the "View recipe JSON" action works even while the
  // contract is loading or the request failed.
  const [previewRecipeJson, setPreviewRecipeJson] =
    useState<ServiceContractRecipe | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(search.picker ?? false);
  const { open: isAssistantOpen, setOpen: setIsAssistantOpen } =
    useGlobalAssistant();
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);

  // Derived
  const selectedStep =
    draft.steps.find((s) => s.stepId === selectedStepId) ?? null;
  const isDirty =
    draft.steps.length > REQUIRED_STEP_IDS.length ||
    draft.formId !== "" ||
    draft.title !== "";
  // The honest "has unsaved work" flag: compare the live draft against the
  // saved baseline. Before any save/load there's no baseline, so a brand-new
  // form falls back to isDirty ("is the form non-empty"). draftsEqual ignores
  // version/timestamps/editor-only ids, so it goes clean right after a save.
  // `comparePayments` so a payment-processor edit (stripped from the recipe,
  // #958) still flags as unsaved — both sides here retain payment config.
  const hasUnsavedChanges =
    savedDraft === null
      ? isDirty
      : !draftsEqual(draft, savedDraft, { comparePayments: true });

  // Any draft edit invalidates the last validate/save verdict in the header —
  // otherwise "✓ Valid" sits beside "● Unsaved changes" and lies. Validation
  // and saving never mutate `draft`, so the verdict survives until a real
  // edit. (Same-value setState bails out, so per-keystroke runs are free.)
  useEffect(() => {
    setLastSaveStatus("idle");
  }, [draft]);

  useBlocker({
    enableBeforeUnload: hasUnsavedChanges,
    shouldBlockFn: async ({ current, next }) =>
      (current.routeId !== next.routeId ||
        JSON.stringify(current.search) !== JSON.stringify(next.search)) &&
      hasUnsavedChanges &&
      !(await confirm({
        title: "Discard unsaved changes?",
        description: "Unsaved changes will be lost. Continue?",
        confirmLabel: "Discard changes",
        destructive: true,
      })),
  });
  // Live recipe-wide uniqueness check over resolved field ids + step ids. Drives
  // the red duplicate-ID banner below the body; the collision pre-flight inside
  // runValidation re-checks it on every Save draft / Deploy click.
  const idCollisions = useMemo(
    () => findRecipeIdCollisions(draft, catalog),
    [draft, catalog],
  );

  // Resolved field paths (stepId.fieldId, blocks expanded) for the processor
  // config path-pickers. Same memo shape as idCollisions above.
  const resolvedFieldIds = useMemo(
    () => resolveFieldIds(draft, catalog),
    [draft, catalog],
  );

  // Form-level uniqueness mirror of the API checks (#545): a new form's formId
  // and the title must not collide with another form. Drives the live formId
  // error in the toolbar and hard-gates Save draft / Deploy below. `forms` is
  // null until useFormsList resolves; treat that as "nothing to collide with"
  // and let the API re-check on save.
  const uniqueness = useMemo(
    () => checkFormUniqueness(forms ?? [], draft, loadedFromId),
    [forms, draft, loadedFromId],
  );

  // Re-key published guard (#674): a published form's ID can't be changed.
  // Mirror the API's 409 so the user is pre-blocked at save time rather than
  // only seeing the failure after the round-trip.
  const rekeyError = useMemo(
    () => checkRekeyPublished(forms ?? [], draft, loadedFromId),
    [forms, draft, loadedFromId],
  );

  // Editing presence / read-only lock (#874). Claim the open form's single
  // editing session, keyed on the loaded form's id. A brand-new, unsaved form
  // has no concurrent editor (and the API exempts brand-new creation), so we
  // pass null until the form has been loaded/saved. When another user holds the
  // fresh claim, `isReadOnly` disables the edit affordances, Save and Deploy,
  // and the banner names the current editor.
  const { isReadOnly, holder: presenceHolder } = usePresence(loadedFromId);

  // Recipe validation verdict + pre-flight gates (isValidating / validateResult
  // / lastSaveStatus). Setters are exposed so the draft-change effect above, the
  // save flow, and the lifecycle handlers can reset the verdict they share.
  const {
    isValidating,
    validateResult,
    lastSaveStatus,
    setValidateResult,
    setLastSaveStatus,
    runValidation,
    blockedByUniqueness,
    blockedByIncompletePayment,
    blockedByDraftVisibility,
    dismiss,
  } = useRecipeValidation({
    draft,
    catalog,
    uniqueness,
    rekeyError,
    onFocusProcessors: () => setMainView("processors"),
  });

  // Save draft + deploy flow (submit/publish state, modal, and handlers).
  // setSubmitSuccess / setSubmitError are exposed so the Save-draft click and
  // the lifecycle handlers can reset the submit banner they share.
  const {
    isSubmitting,
    submitSuccess,
    submitError,
    isPublishOpen,
    isPublishing,
    publishSuccess,
    publishError,
    setSubmitSuccess,
    setSubmitError,
    handleSubmit,
    handleOpenPublish,
    handlePublish,
    handleClosePublish,
  } = useRecipeSave({
    serviceDraft,
    onServiceSaved: setServiceDraft,
    onServicePublish: () =>
      void navigate({
        to: "/services",
        search: { service: serviceDraft?.manifest.serviceId, tab: "publish" },
      }),
    draft,
    loadedFromId,
    forms,
    hasUnsavedChanges,
    setSavedDraft,
    setLoadedFromId,
    setLastSaveStatus,
    upsertForm,
    refetchForms,
  });

  // Draft lifecycle: load / apply-AI / new / discard / duplicate + the shared
  // editor reset. Takes every setter it orchestrates (validation, save, preview,
  // nav) since the reset crosscuts all those clusters.
  const {
    handleLoad: loadDraft,
    applyAiRecipe,
    handleNew: resetDraft,
    handleDiscard,
    handleDuplicate: duplicateDraft,
  } = useDraftLifecycle({
    draft,
    newDraft,
    savedDraft,
    dispatch,
    setSavedDraft,
    setLoadedFromId,
    setSelectedStepId,
    setMainView,
    setValidateResult,
    setLastSaveStatus,
    setSubmitSuccess,
    setSubmitError,
    setPreviewData,
    setPreviewRecipeJson,
    setPreviewError,
    setIsPickerOpen,
    setIsSubmitOpen,
    setIsPreviewOpen,
  });

  // Search navigation can load a different service while this route stays mounted.
  // Background revalidation of the same form must never replace unsaved edits.
  const applyLinkedDraft = useEffectEvent(
    (incoming: RecipeDraft, formId: string) => {
      if (formId !== loadedFromId) loadDraft(incoming, formId);
    },
  );
  useEffect(() => {
    if (initialDraft && initialFormId)
      applyLinkedDraft(initialDraft, initialFormId);
  }, [initialDraft, initialFormId]);

  function handleLoad(incoming: RecipeDraft, formId: string) {
    loadDraft(incoming, formId);
    void navigate({
      to: "/builder",
      search: { formId, service: serviceKey },
      replace: true,
      ignoreBlocker: true,
    });
  }

  function handleNew() {
    resetDraft();
    void navigate({
      to: "/services",
      search: { service: serviceKey },
      replace: true,
      ignoreBlocker: true,
    });
  }

  function handleDuplicate(incoming: RecipeDraft) {
    duplicateDraft(incoming);
    void navigate({
      to: "/services",
      search: { service: serviceKey },
      replace: true,
      ignoreBlocker: true,
    });
  }

  // Form management: delete / disable / erase / enable, off the Open picker.
  const {
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
  } = useFormManagement({
    loadedFromId,
    onClearEditor: handleNew,
    refetchForms,
    setIsPickerOpen,
  });

  // Handlers
  // Save draft / Deploy validate the current draft on click, then open their
  // modal only if it's valid. One click, not two — and because every click
  // re-validates the live draft, a stale validateResult can never green-light a
  // bad save.
  //
  // Save draft is the exception: an invalid draft can still be saved once the
  // user confirms, so an in-progress form can be shared for review. The errors
  // stay lit in the validation panel either way; the SubmitModal still collects
  // (and semver-validates) the version. Deploy stays hard-gated on validity.
  const handleSaveDraftClick = async () => {
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (
      !result.valid &&
      !(await confirm({
        title: "Save with validation errors?",
        description:
          "This form has validation errors. Save it as a draft anyway so others can review it?",
        confirmLabel: "Save draft",
      }))
    ) {
      return;
    }
    setSubmitSuccess(false);
    setSubmitError(null);
    setIsSubmitOpen(true);
  };

  const handleDeployClick = async () => {
    if (blockedByDraftVisibility()) return;
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (result.valid) handleOpenPublish();
  };

  const handlePreview = async () => {
    if (serviceDraft) {
      setServicePreview({
        ...serviceDraft,
        recipe: serializeRecipeDraft(draft),
        manifest: { ...serviceDraft.manifest, formId: draft.formId },
        pendingConfig: {
          mdaContactId: draft.mdaContactId ?? null,
          processors: extractDbProcessors(draft.processors),
        },
      });
      return;
    }
    setIsPreviewOpen(true);
    setIsPreviewing(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    try {
      const recipe = serializeRecipeDraft(draft);
      // Captured before the request so the JSON is inspectable even when the
      // preview request fails — failure is exactly when you want to see it.
      setPreviewRecipeJson(recipe);
      const contract = (await previewRecipe({
        data: { recipe },
      })) as ServiceContract;
      setPreviewData(contract as ServiceContract);
    } catch (e) {
      setPreviewError(
        e instanceof Error ? e.message : "Preview request failed",
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleFormIdChange = (id: string) => {
    dispatch({
      type: "SET_FORM_META",
      formId: id,
      title: draft.title,
      description: draft.description,
    });
  };

  const handleTitleChange = (title: string) => {
    dispatch({
      type: "SET_FORM_META",
      formId: draft.formId,
      title,
      description: draft.description,
    });
  };

  const handleVisibilityChange = (visibility: RecipeVisibility) => {
    dispatch({ type: "SET_VISIBILITY", visibility });
  };

  // Create an MDA contact via the API, patch it into the local directory so the
  // dropdown shows it immediately, and hand the created row back to the editor
  // (which selects it). Issue #607.
  const handleCreateMdaContact = async (
    input: CreateMdaContactInput,
  ): Promise<MdaContact> => {
    const created = await createMdaContact({ data: input });
    upsertMdaContact(created);
    return created;
  };

  const handleSelectStep = (stepId: string) => {
    setSelectedStepId(stepId);
    setMainView("step");
  };

  const handleSelectProcessors = () => {
    setMainView("processors");
  };

  const handleSelectContactDetails = () => {
    setMainView("contactDetails");
  };

  const handleAddStep = () => {
    const stepId = nextStepId(draft.steps);
    dispatch({ type: "ADD_STEP" });
    setSelectedStepId(stepId);
    setMainView("step");
  };

  const handleDuplicateStep = (stepId: string) => {
    const step = draft.steps.find((item) => item.stepId === stepId);
    if (!step) return;
    const copy = duplicateStepDraft(draft, step, catalog);
    dispatch({ type: "DUPLICATE_STEP", stepId, copy });
    handleSelectStep(copy.stepId);
  };

  const handleRemoveStep = (stepId: string) => {
    dispatch({ type: "REMOVE_STEP", stepId });
    if (selectedStepId === stepId) setSelectedStepId(null);
  };

  const handleMoveStepUp = (index: number) => {
    dispatch({ type: "REORDER_STEPS", fromIndex: index, toIndex: index - 1 });
  };

  const handleMoveStepDown = (index: number) => {
    dispatch({ type: "REORDER_STEPS", fromIndex: index, toIndex: index + 1 });
  };

  const handleStepIdChange = (_oldId: string, newId: string) => {
    setSelectedStepId(newId);
  };

  const contentList = useContentList(!!serviceKey);
  const serviceIndex = useServiceIndex();
  const service = useMemo(
    () =>
      mergeServiceRows(
        buildServiceRows(forms ?? [], contentList.pages ?? []),
        serviceIndex.entries,
      ).find((row) => row.key === serviceKey),
    [forms, contentList.pages, serviceKey, serviceIndex.entries],
  );

  return (
    <AppShell
      section="builder"
      user={user.login}
      title="Application form"
      service={
        serviceKey
          ? {
              key: serviceKey,
              title: service?.title ?? (draft.title.trim() || "Service"),
              formId: draft.formId,
              pages: service?.pages,
            }
          : undefined
      }
      assistantOpen={isAssistantOpen}
      onToggleAssistant={() => setIsAssistantOpen((open) => !open)}
      assistant={
        <FormAssistant
          open={isAssistantOpen}
          onOpenChange={setIsAssistantOpen}
          user={user.login}
          documentId={loadedFromId ?? search.newFormId ?? "new"}
          draft={draft}
          catalog={catalog}
          readOnly={isReadOnly}
          selection={
            mainView === "step"
              ? selectedStep
                ? `${selectedStep.title} (${selectedStep.stepId})`
                : undefined
              : mainView === "processors"
                ? "Processors"
                : "Contact details"
          }
          onApply={applyAiRecipe}
        />
      }
    >
      <Sidebar.Provider
        contained
        collapsible="offcanvas"
        mobileBreakpoint={isAssistantOpen ? 1600 : 1120}
        className="flex h-full min-h-0 flex-col font-sans text-[length:var(--text-base)] text-ui-default [--sidebar-width:15rem]"
      >
        {isReadOnly && presenceHolder && (
          <PresenceBanner holder={presenceHolder} />
        )}
        <Toolbar
          serviceScoped={!!serviceKey}
          leading={
            <Sidebar.Trigger
              aria-label="Form pages"
              className="h-11 w-auto gap-2 px-2 text-sm"
            >
              <ListChecksIcon size={18} aria-hidden="true" />
              <span>Form pages</span>
            </Sidebar.Trigger>
          }
          formId={draft.formId}
          title={draft.title}
          idError={uniqueness.idError}
          isDirty={isDirty}
          hasUnsavedChanges={hasUnsavedChanges}
          isValidating={isValidating}
          isPreviewing={isPreviewing}
          previewLabel={
            serviceDraft
              ? mainView === "step" && selectedStep
                ? "Preview this page"
                : "Preview from start"
              : undefined
          }
          isSubmitting={isSubmitting}
          isPublishing={isPublishing}
          isReadOnly={isReadOnly}
          lastSaveStatus={lastSaveStatus}
          visibility={getRecipeVisibility(draft)}
          onVisibilityChange={handleVisibilityChange}
          onFormIdChange={handleFormIdChange}
          onTitleChange={handleTitleChange}
          onNew={handleNew}
          onOpen={() => setIsPickerOpen(true)}
          onValidate={runValidation}
          onPreview={handlePreview}
          onSubmit={handleSaveDraftClick}
          onPublish={handleDeployClick}
          onDiscard={handleDiscard}
        />

        <div className="flex min-h-0 flex-1">
          <div className="relative flex min-w-0 flex-1 flex-col bg-ui-canvas">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <StepList
                steps={draft.steps}
                catalog={catalog}
                onDuplicate={handleDuplicateStep}
                selectedStepId={mainView === "step" ? selectedStepId : null}
                onSelect={handleSelectStep}
                onAdd={handleAddStep}
                onRemove={handleRemoveStep}
                onMoveUp={handleMoveStepUp}
                onMoveDown={handleMoveStepDown}
                processorCount={draft.processors?.length ?? 0}
                serviceScoped={!!serviceDraft}
                isProcessorsActive={mainView === "processors"}
                onSelectProcessors={handleSelectProcessors}
                hasContactDetails={draft.contactDetails !== undefined}
                isContactDetailsActive={mainView === "contactDetails"}
                onSelectContactDetails={handleSelectContactDetails}
              />

              <div
                id="builder-canvas"
                tabIndex={-1}
                className="flex min-h-0 min-w-0 flex-1 flex-col outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-focus"
              >
                <BuilderPanel
                  mainView={mainView}
                  draft={draft}
                  dispatch={dispatch}
                  catalog={catalog}
                  selectedStep={selectedStep}
                  focusLogic={
                    search.focus === "logic" &&
                    search.step === selectedStep?.stepId
                  }
                  mdaContacts={mdaContacts}
                  mdaContactsLoadError={mdaContactsLoadError}
                  resolvedFieldIds={resolvedFieldIds}
                  onCreateContact={handleCreateMdaContact}
                  onStepIdChange={handleStepIdChange}
                  onAddStep={handleAddStep}
                  onOpenForm={() => setIsPickerOpen(true)}
                />
              </div>
            </div>

            {/* Floating over the canvas (not in-flow) so appearing/dismissing never
          reflows the editor underneath. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-4 pb-3 *:pointer-events-auto *:m-0 *:translate-y-0 *:opacity-100 *:shadow-[0_2px_10px_rgb(0_0_0/0.08)] *:transition-[opacity,translate] *:duration-250 *:ease-[cubic-bezier(0.22,1,0.36,1)] starting:*:translate-y-2.5 starting:*:opacity-0 motion-reduce:*:transition-none">
              <CollisionBanner idCollisions={idCollisions} />

              <ValidationPanel result={validateResult} onDismiss={dismiss} />
            </div>

            <FormPicker
              open={isPickerOpen}
              forms={
                scopedFormId
                  ? (forms?.filter((form) => form.formId === scopedFormId) ??
                    null)
                  : forms
              }
              allowDuplicate={false}
              loadError={formsLoadError}
              openPRs={formOpenPRs}
              isDirty={isDirty}
              catalog={catalog}
              onLoad={handleLoad}
              onClose={() => setIsPickerOpen(false)}
              onRequestDelete={handleRequestDelete}
              onRequestDisable={handleRequestDisable}
              onRequestErase={handleRequestErase}
              onEnable={handleEnable}
              onDuplicate={handleDuplicate}
            />

            {servicePreview && (
              <ServicePreview
                snapshot={servicePreview}
                initialStepId={
                  mainView === "step" ? selectedStep?.stepId : undefined
                }
                initialPageId="form"
                onClose={() => setServicePreview(null)}
              />
            )}
            <PreviewModal
              open={isPreviewOpen}
              contract={previewData}
              isLoading={isPreviewing}
              error={previewError}
              previewUrl={loadedFromId ? formPreviewUrl(loadedFromId) : null}
              recipe={previewRecipeJson}
              onClose={() => setIsPreviewOpen(false)}
            />

            <SubmitModal
              open={isSubmitOpen}
              draft={draft}
              loadedFromId={loadedFromId}
              isSubmitting={isSubmitting}
              submitSuccess={submitSuccess}
              submitError={submitError}
              isReadOnly={isReadOnly}
              onSubmit={handleSubmit}
              onClose={() => setIsSubmitOpen(false)}
            />

            <PublishModal
              open={isPublishOpen}
              draft={draft}
              baseBranch={baseBranch}
              isPublishing={isPublishing}
              publishSuccess={publishSuccess}
              publishError={publishError}
              isReadOnly={isReadOnly}
              onPublish={handlePublish}
              onClose={handleClosePublish}
            />

            <DeleteModal
              open={isDeleteOpen}
              formId={deleteTarget?.formId ?? ""}
              title={deleteTarget?.title ?? ""}
              isPublished={deleteTarget?.isPublished}
              isDeleting={isDeleting}
              deleteError={deleteError}
              onConfirm={handleConfirmDelete}
              onClose={handleCloseDelete}
            />

            <DisableModal
              open={isDisableOpen}
              formId={disableTarget?.formId ?? ""}
              title={disableTarget?.title ?? ""}
              isDisabling={isDisabling}
              disableError={disableError}
              onConfirm={handleConfirmDisable}
              onClose={handleCloseDisable}
            />

            <EraseModal
              open={isEraseOpen}
              formId={eraseTarget?.formId ?? ""}
              title={eraseTarget?.title ?? ""}
              isErasing={isErasing}
              eraseSuccess={eraseSuccess}
              eraseError={eraseError}
              onConfirm={handleConfirmErase}
              onClose={handleCloseErase}
            />
          </div>
        </div>
      </Sidebar.Provider>
    </AppShell>
  );
}
