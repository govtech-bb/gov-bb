import "../../styles/builder.global.css";
import { createFileRoute } from "@tanstack/react-router";
import { useReducer, useState, useMemo, useRef } from "react";
import { getCatalogFn } from "../../server/registry";
import { submitRecipe, updateRecipe, rekeyRecipe, deleteForm, disableForm, enableForm } from "../../server/forms";
import { createMdaContact } from "../../server/mda-contacts";
import { publishRecipe, getPublishBaseBranch, getNextDeployVersion, eraseRecipe } from "../../server/publish";
import { validateRecipe, previewRecipe } from "../../server/registry";
import { serializeRecipeDraft, findRecipeIdCollisions, formatCollisionIssues, resolveFieldIds, extractDbProcessors, firstIncompletePaymentProcessor } from "@govtech-bb/form-builder";
import { bumpMinor, bumpPatch } from "../../lib/version";
import type { ServiceContract, ServiceContractRecipe } from "@govtech-bb/form-types";
import { KEBAB_ID_PATTERN, KEBAB_ID_ERROR } from "@govtech-bb/form-types";
import type { RecipeDraft, ValidationResult, RecipeValidateResponse, ValidationIssue, UnknownRef } from "@govtech-bb/form-builder";

import { buildLoadArgs, draftsEqual } from "./-apply-recipe";
import { AiSidebar, type ApplyRecipeResult } from "./-ai-sidebar";
import { recipeReducer, EMPTY_DRAFT, nextStepId, REQUIRED_STEP_IDS, isRequiredStep, firstStepId } from "./-recipe-reducer";
import { Toolbar } from "./-toolbar";
import { usePresence } from "./-use-presence";
import { PresenceBanner } from "./-presence-banner";
import { StepList } from "./-step-list";
import { StepEditor } from "./-step-editor";
import { ProcessorsEditor } from "./-processors-editor";
import { ContactDetailsEditor } from "./-contact-details-editor";
import { ValidationPanel } from "./-validation-panel";
import { PreviewModal } from "./-preview-modal";
import { formPreviewUrl } from "../../lib/form-url";
import { SubmitModal } from "./-submit-modal";
import { PublishModal } from "./-publish-modal";
import { FormPicker } from "./-form-picker";
import { checkFormUniqueness, checkRekeyPublished } from "./-form-uniqueness";
import { useFormsList } from "./-use-forms-list";
import { useMdaContacts } from "./-use-mda-contacts";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
import { DeleteModal } from "./-delete-modal";
import { DisableModal } from "./-disable-modal";
import { EraseModal } from "./-erase-modal";
import type { FormDefinitionSummary } from "../../types/index";

import styles from "../../styles/builder.module.css";

export const Route = createFileRoute("/builder/")({
  // The catalog is needed for the first render (StepEditor, the duplicate-ID
  // memo) and is cheap thanks to its 60s server cache. The base branch is a
  // tiny env-var read resolved server-side (it can't be read from the client
  // bundle), so it rides along here. The forms list is a slow, uncached
  // GitHub-API waterfall consumed only by the Open picker, so it stays off the
  // critical path via useFormsList.
  loader: async () => {
    const [catalog, baseBranch] = await Promise.all([
      getCatalogFn(),
      getPublishBaseBranch(),
    ]);
    return { catalog, baseBranch };
  },
  component: BuilderPage,
});

function BuilderPage() {
  const { catalog, baseBranch } = Route.useLoaderData();
  const {
    forms,
    loadError: formsLoadError,
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
  const [draft, dispatch] = useReducer(recipeReducer, EMPTY_DRAFT);
  // Snapshot of the last saved/loaded draft — the baseline that "unsaved
  // changes" is measured against. null for a brand-new form (no save/load yet);
  // set on load, on save-success, and back to null on New.
  const [savedDraft, setSavedDraft] = useState<RecipeDraft | null>(null);

  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  // Which view the main area shows. Processors and contact details are
  // form-scoped, so they each get a sibling view to the per-step editor rather
  // than living inside a step.
  const [mainView, setMainView] = useState<
    "step" | "processors" | "contactDetails"
  >("step");
  const [version, setVersion] = useState("1.0.0");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [loadedFromId, setLoadedFromId] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<RecipeValidateResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ServiceContract | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // The serialized draft captured when Preview is pressed (#744) — set before
  // the preview request so the "View recipe JSON" action works even while the
  // contract is loading or the request failed.
  const [previewRecipeJson, setPreviewRecipeJson] = useState<ServiceContractRecipe | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<
    { prUrl: string; prNumber: number } | null
  >(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Server-resolved Deploy target (#873): bumps past base-branch versions and
  // open deploy PRs, not just the DB draft. Null while resolving; falls back
  // to the client bump on error (publishRecipe re-checks server-side).
  const [deployTarget, setDeployTarget] = useState<string | null>(null);
  // Guards handleOpenPublish against a stale resolution overwriting a fresher one (open→close→reopen).
  const publishResolveSeq = useRef(0);
  const [lastSaveStatus, setLastSaveStatus] = useState<"idle" | "success" | "error" | "submitted">("idle");
  const [deleteTarget, setDeleteTarget] = useState<FormDefinitionSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<FormDefinitionSummary | null>(null);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [eraseTarget, setEraseTarget] = useState<FormDefinitionSummary | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [eraseSuccess, setEraseSuccess] = useState<
    { prUrl: string; prNumber: number } | null
  >(null);

  // Derived
  const selectedStep = draft.steps.find((s) => s.stepId === selectedStepId) ?? null;
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
  const editableSteps = draft.steps.filter((s) => !isRequiredStep(s.stepId));
  const hasEditableSteps = editableSteps.length > 0;
  // Live recipe-wide uniqueness check over resolved field ids + step ids. Drives
  // the red duplicate-ID banner below the body; the collision pre-flight inside
  // runValidation re-checks it on every Save draft / Deploy click.
  const idCollisions = useMemo(
    () => findRecipeIdCollisions(draft, catalog),
    [draft, catalog],
  );
  const hasIdCollisions =
    idCollisions.fieldIdCollisions.length > 0 ||
    idCollisions.stepIdCollisions.length > 0;

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

  // Versioning is deterministic and client-side — no async round-trip on the
  // load path (that fetch was the source of the version flicker). The loaded /
  // working version (`version`, set by handleLoad / handleNew / handleSubmit) is
  // the single source of truth. Save Changes overwrites the loaded draft in
  // place at its current version (#329) — defaulting the modal to currentVersion
  // makes the isInPlaceUpdate branch fire (updateRecipe/PUT) so repeated saves
  // don't mint duplicate drafts. The SubmitModal pins this field read-only on
  // the update path, so there's no fork-a-new-version escape hatch from Save
  // Changes — Deploy still cuts a minor. A brand-new form (no current version)
  // starts at 1.0.0 and keeps an editable version picker.
  //
  // Exception (this fix): when the loaded version is the *published* one, an
  // in-place overwrite is impossible — the API forbids mutating a published
  // recipe ("Cannot update a published recipe"). So Save Changes auto-bumps a
  // patch and cuts a fresh draft version instead of overwriting the immutable
  // published row. A higher unpublished draft over a published version
  // (publishedVersion < currentVersion) is still overwritten in place.
  //
  // This reads the live `forms` list (treating the still-loading null as
  // empty). That's safe because the only path that sets currentVersion to a
  // published version is loading a form through the Open picker, which only
  // renders its rows once `forms` has resolved — so the list is always
  // populated by the time a published form can be the working version.
  const currentVersionIsPublished =
    !!currentVersion &&
    (forms ?? []).some(
      (f) => f.formId === loadedFromId && f.publishedVersion === currentVersion,
    );
  const saveDraftVersion = currentVersion
    ? currentVersionIsPublished
      ? bumpPatch(currentVersion)
      : currentVersion
    : "1.0.0";
  const deployVersion = currentVersion ? bumpMinor(currentVersion) : "1.0.0";

  // Editing presence / read-only lock (#874). Claim the open form's single
  // editing session, keyed on the loaded form's id. A brand-new, unsaved form
  // has no concurrent editor (and the API exempts brand-new creation), so we
  // pass null until the form has been loaded/saved. When another user holds the
  // fresh claim, `isReadOnly` disables the edit affordances, Save and Deploy,
  // and the banner names the current editor.
  const { isReadOnly, holder: presenceHolder } = usePresence(loadedFromId);

  // Handlers
  // Runs the full validation flow (pre-flight checks + server validate), sets
  // all the state it always has, AND returns the computed result. Returning it
  // lets the Save draft / Deploy click handlers act on a fresh validation
  // synchronously — React state updates are async, so they can't read
  // validateResult right after triggering it.
  const runValidation = async (): Promise<RecipeValidateResponse> => {
    setIsValidating(true);
    try {
      // Pre-flight checks that the server schema would also fail, but with friendlier messages.
      if (!hasEditableSteps) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: [
            {
              path: "steps",
              message:
                "Add at least one step before the required Declaration and Submission Confirmation steps.",
            },
          ],
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }
      const emptyStep = editableSteps.find((s) => s.fields.length === 0);
      if (emptyStep) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: [
            {
              path: `steps[${emptyStep.stepId}].fields`,
              message: `Step "${emptyStep.title || emptyStep.stepId}" has no fields.`,
            },
          ],
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      // Pre-flight: surface duplicate resolved fieldIds / stepIds in the panel.
      // (The server contract validator can't resolve catalog defaults, so this
      // is the client's job — same pattern as the empty-step pre-flight above.)
      const collisions = findRecipeIdCollisions(draft, catalog);
      if (
        collisions.fieldIdCollisions.length > 0 ||
        collisions.stepIdCollisions.length > 0
      ) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: formatCollisionIssues(collisions),
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      // Pre-flight: Form ID and Title identify the form before deploy. The
      // schema rejects an empty/malformed formId or empty title too, but a
      // friendly message beats Zod's raw "String must contain at least 1
      // character(s)". Reported together so the author fixes both at once.
      const identityIssues: ValidationIssue[] = [];
      if (draft.formId.trim() === "") {
        identityIssues.push({ path: "formId", message: "Form ID is required" });
      } else if (!KEBAB_ID_PATTERN.test(draft.formId)) {
        identityIssues.push({ path: "formId", message: KEBAB_ID_ERROR });
      }
      if (draft.title.trim() === "") {
        identityIssues.push({ path: "title", message: "Title is required" });
      }
      if (identityIssues.length > 0) {
        const result: RecipeValidateResponse = {
          valid: false,
          issues: identityIssues,
        };
        setValidateResult(result);
        setLastSaveStatus("error");
        return result;
      }

      const recipe = serializeRecipeDraft(draft, { version });
      const raw = (await validateRecipe({ data: { recipe } })) as ValidationResult;
      const result: RecipeValidateResponse = {
        valid: raw.ok,
        issues: raw.ok ? [] : raw.issues,
      };
      setValidateResult(result);
      setLastSaveStatus(raw.ok ? "success" : "error");
      return result;
    } catch (e) {
      const result: RecipeValidateResponse = {
        valid: false,
        issues: [
          { path: "", message: e instanceof Error ? e.message : "Validation request failed" },
        ],
      };
      setValidateResult(result);
      setLastSaveStatus("error");
      return result;
    } finally {
      setIsValidating(false);
    }
  };

  // Save draft / Deploy validate the current draft on click, then open their
  // modal only if it's valid. One click, not two — and because every click
  // re-validates the live draft, a stale validateResult can never green-light a
  // bad save.
  //
  // Save draft is the exception: an invalid draft can still be saved once the
  // user confirms, so an in-progress form can be shared for review. The errors
  // stay lit in the validation panel either way; the SubmitModal still collects
  // (and semver-validates) the version. Deploy stays hard-gated on validity.
  // Hard gate for both Save draft and Deploy: form-level formId/title
  // collisions can never be saved (unlike contract errors, which Save draft can
  // override). Lights the always-visible validation panel and returns true when
  // blocked. The API re-checks draft collisions on save (it does not yet see
  // published forms — see -form-uniqueness.ts).
  const blockedByUniqueness = (): boolean => {
    const issues = [
      uniqueness.idError && { path: "formId", message: uniqueness.idError },
      rekeyError && { path: "formId", message: rekeyError },
      uniqueness.titleError && { path: "title", message: uniqueness.titleError },
    ].filter((i): i is { path: string; message: string } => Boolean(i));
    if (issues.length === 0) return false;
    setValidateResult({ valid: false, issues });
    setLastSaveStatus("error");
    return true;
  };

  // Hard gate for both Save draft and Deploy: a payment processor with an
  // incomplete config (e.g. the empty strings makeDefaultProcessor seeds) is
  // sent as the DB `processors` sibling, where the builder API 400s the WHOLE
  // save with an opaque error (#716 follow-up). Pre-flight the same author-time
  // payment schema the API enforces and surface a friendly, targeted message in
  // the always-visible validation panel instead, blocking the save so no request
  // is sent. Lights the panel and returns true when blocked. This is a hard gate
  // even on Save draft (unlike contract errors, which Save draft can override),
  // because an incomplete payment config can never be persisted.
  const blockedByIncompletePayment = (): boolean => {
    const index = firstIncompletePaymentProcessor(draft.processors);
    if (index === null) return false;
    setMainView("processors");
    setValidateResult({
      valid: false,
      issues: [
        {
          path: "processors",
          message:
            "A payment processor is incomplete. Open the Processors panel and fill in every payment field before saving.",
        },
      ],
    });
    setLastSaveStatus("error");
    return true;
  };

  const handleSaveDraftClick = async () => {
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (
      !result.valid &&
      !window.confirm(
        "This form has validation errors. Save it as a draft anyway so others can review it?",
      )
    ) {
      return;
    }
    setSubmitSuccess(false);
    setSubmitError(null);
    setIsSubmitOpen(true);
  };

  const handleDeployClick = async () => {
    if (blockedByUniqueness()) return;
    if (blockedByIncompletePayment()) return;
    const result = await runValidation();
    if (result.valid) handleOpenPublish();
  };

  const handleDismissValidation = () => {
    setValidateResult(null);
    setLastSaveStatus("idle");
  };

  const handlePreview = async () => {
    setIsPreviewOpen(true);
    setIsPreviewing(true);
    setPreviewError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version });
      // Captured before the request so the JSON is inspectable even when the
      // preview request fails — failure is exactly when you want to see it.
      setPreviewRecipeJson(recipe);
      const contract = await previewRecipe({ data: { recipe } }) as ServiceContract;
      setPreviewData(contract as ServiceContract);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview request failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (submitVersion: string) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version: submitVersion });
      // Three save shapes, branching on the loaded id (captured before
      // setLoadedFromId below overwrites loadedFromId — the picker refresh
      // branches on these too):
      //  - create: nothing was loaded, so this is a brand-new form.
      //  - re-key (#674): a loaded form whose id was changed — an atomic
      //    identity move, not a create (which would self-collide on title and
      //    leave a stale old-id row).
      //  - in-place / new version: the loaded id is unchanged.
      const oldFormId = loadedFromId;
      const isCreate = oldFormId === null;
      // An empty id is never a re-key — it's left to the "Form ID is required"
      // gate (mirrors checkRekeyPublished, which excludes empties too), so a
      // cleared id on a save-anyway doesn't round-trip to the rekey endpoint.
      const isRekey =
        oldFormId !== null && draft.formId !== "" && draft.formId !== oldFormId;
      // A same-version save of the same form overwrites its row in place
      // (updateRecipe); any higher version creates a new draft row
      // (submitRecipe). This split also decides the picker row's isPublished.
      // A published current version is never overwritten in place — saving it
      // cuts a new draft version (saveDraftVersion already bumps the patch), so
      // exclude it here too as a belt-and-suspenders against the API's
      // "Cannot update a published recipe" rejection.
      const isInPlaceUpdate =
        !!oldFormId &&
        draft.formId === oldFormId &&
        !!currentVersion &&
        submitVersion === currentVersion &&
        !currentVersionIsPublished;
      // The selected per-environment MDA contact (issue #607). DB-only: it
      // rides alongside the recipe as a sibling field on create/update so the
      // API upserts it into form_config. Only sent when the draft carries a
      // value (undefined → key omitted, so an untouched selection isn't cleared).
      const mdaContactId = draft.mdaContactId;
      // Payment processors are a DB-only sibling (#716): pull them out of the
      // draft and send them in `processors` (the serializer already strips them
      // from `recipe`). `null` when there are none — clears the DB key. A re-key
      // moves the whole form_config row, so it doesn't resend the siblings.
      const processors = extractDbProcessors(draft.processors);
      if (isRekey) {
        await rekeyRecipe({ data: { oldFormId, recipe } });
      } else if (isInPlaceUpdate) {
        await updateRecipe({
          data: { formId: oldFormId, recipe, mdaContactId, processors },
        });
      } else {
        // Tells the API to enforce formId uniqueness for a genuine create.
        await submitRecipe({
          data: { recipe, isNew: isCreate, mdaContactId, processors },
        });
      }
      setSubmitSuccess(true);
      setLastSaveStatus("submitted");
      // The just-saved draft is now the baseline, so the unsaved indicator
      // clears immediately after a successful save.
      setSavedDraft(draft);
      setLoadedFromId(draft.formId);

      // Keep the Open picker fresh without a reload. A new form needs the full
      // refetch so its row carries the server's published/disabled merge; a
      // re-key needs it too so the old-id row disappears and the new one
      // appears (a one-row upsert can't drop the stale row). A plain re-save
      // just patches the existing row from data we already hold, skipping the
      // slow listForms() waterfall.
      if (isCreate || isRekey) {
        refetchForms();
      } else {
        // Mirror what a refetch's listForms() merge would produce for this row.
        const existing = forms?.find((f) => f.formId === draft.formId);
        upsertForm({
          // Preserve the server-assigned id (distinct from formId for drafts);
          // fall back to formId only when appending a row we've never seen.
          id: existing?.id ?? draft.formId,
          formId: draft.formId,
          title: draft.title,
          version: submitVersion,
          // Saving a draft never changes published-index membership (or the
          // published version), so preserve both exactly as the server merge
          // would: a never-published draft stays unpublished, and a published
          // form keeps its badge whether the save overwrote a draft in place or
          // cut a new draft version off the published one.
          isPublished: existing?.isPublished ?? false,
          publishedVersion: existing?.publishedVersion,
        });
      }

      // The just-saved version becomes the new working/current version, so the
      // toolbar reflects it and the next Save-draft patch / Deploy minor bumps
      // off it. No server round-trip — the bump is computed client-side.
      setCurrentVersion(submitVersion);
      setVersion(submitVersion);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPublish = async () => {
    const seq = ++publishResolveSeq.current;
    setPublishSuccess(null);
    setPublishError(null);
    setDeployTarget(null);
    setIsPublishOpen(true);
    try {
      const next = await getNextDeployVersion({
        data: { formId: draft.formId, currentVersion },
      });
      if (seq === publishResolveSeq.current) setDeployTarget(next.version);
    } catch {
      if (seq === publishResolveSeq.current) setDeployTarget(deployVersion);
    }
  };

  const handlePublish = async (description: string) => {
    // Deploy requires a saved draft (#331), and this is the one place the
    // check holds: the toolbar's disabled gate goes stale the moment the
    // author edits during the validate round-trip, while this handler is
    // recreated each render so it reads the live hasUnsavedChanges right
    // before the irreversible publishRecipe call.
    if (hasUnsavedChanges) {
      setPublishError("Save draft before deploying.");
      return;
    }
    if (!deployTarget) return; // still resolving — button is disabled anyway
    setIsPublishing(true);
    setPublishError(null);
    try {
      const recipe = serializeRecipeDraft(draft, { version: deployTarget });
      const result = await publishRecipe({ data: { recipe, description } });
      setPublishSuccess(result);
      // The deploy reserved a draft row at deployTarget (#873) — make it the
      // working version so a follow-up Save/Deploy bumps off it, and patch the
      // picker row the same way handleSubmit does.
      setCurrentVersion(deployTarget);
      setVersion(deployTarget);
      const existing = forms?.find((f) => f.formId === draft.formId);
      upsertForm({
        id: existing?.id ?? draft.formId,
        formId: draft.formId,
        title: draft.title,
        version: deployTarget,
        isPublished: false,
        // Deploy opens a review PR, so the published index is unchanged until it
        // merges — preserve the existing publishedVersion (a refetch would still
        // report the old one) rather than dropping it.
        publishedVersion: existing?.publishedVersion,
      });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClosePublish = () => {
    setIsPublishOpen(false);
    setPublishSuccess(null);
    setPublishError(null);
  };

  const handleLoad = (loadedDraft: RecipeDraft, formId: string, ver: string) => {
    const loadAction = { type: "LOAD_DRAFT" as const, draft: loadedDraft };
    dispatch(loadAction);
    // Snapshot the *normalized* draft the reducer produces — LOAD_DRAFT
    // back-fills any missing required steps and reorders them — not the raw
    // input. Snapshotting the raw draft would make a freshly loaded recipe that
    // predates a required step (e.g. check-your-answers) read as already having
    // unsaved changes. LOAD_DRAFT ignores prior state, so `draft` here is just
    // the reducer's required first arg.
    setSavedDraft(recipeReducer(draft, loadAction));
    setLoadedFromId(formId);
    setCurrentVersion(ver);
    setVersion(ver);
    // Open the first step straight away so the author lands in an editable
    // state. firstStepId mirrors LOAD_DRAFT's [...editable, ...required]
    // ordering, so it picks the step the reducer puts first (not loadedDraft[0]).
    setSelectedStepId(firstStepId(loadedDraft));
    setMainView("step");
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  // Apply a recipe the AI sidebar produced, in place, against the live draft:
  // deserialize → (no-op guard) → collect non-blocking defects → confirm-if-dirty
  // → LOAD_DRAFT → bump patch. Returns a result the sidebar surfaces. The draft
  // is only ever replaced on the changed, confirmed path — an unchanged recipe
  // or a structurally-unreadable one never clobbers good work.
  //
  // Recipe-level defects — unresolvable refs (flagged by convert against the
  // full catalog), id collisions, and server contract-validation failures — are
  // loaded-with-a-warning rather than rejected: the draft loads and the defects
  // are surfaced (contract issues + unresolvable refs in the validation panel;
  // id collisions in the always-on collision panel) so the author can fix the
  // bad fields in place or steer with a follow-up prompt (#1051). Deploy/Save
  // re-run their own hard checks, so an invalid form can never publish (#504).
  //
  // Only two cases stay hard errors (nothing to load): a structurally-unreadable
  // recipe where buildLoadArgs throws, and the validate *request* itself failing
  // (an infrastructure error, not a recipe defect — there's no issue to show).
  const applyAiRecipe = async (
    recipe: ServiceContractRecipe,
    unresolvableRefs: UnknownRef[] = [],
  ): Promise<ApplyRecipeResult> => {
    let incoming: RecipeDraft;
    try {
      incoming = buildLoadArgs(recipe, catalog).draft;
    } catch (e) {
      return {
        applied: false,
        error: e instanceof Error ? e.message : "Could not read the AI recipe.",
      };
    }

    // No-op guard first: a conversational tweak can echo the form back
    // unchanged. Don't validate, don't prompt, don't bump — there's nothing to
    // apply. (Equality ignores version, timestamps, and editor-only ids.)
    if (draftsEqual(draft, incoming)) {
      return { applied: false, reason: "unchanged" };
    }

    // Collect non-blocking defects to surface in the validation panel instead of
    // rejecting. unresolvableRefs (from convert) map to the same issue shape.
    const warnings: ValidationIssue[] = unresolvableRefs.map((r) => ({
      path: r.path,
      message: `Unknown component/block ref "${r.ref}" — fix this field before deploying.`,
    }));

    // Note: id collisions are *not* re-checked or collected here. Loading the
    // draft is enough — the always-on collision panel (hasIdCollisions, computed
    // from the live draft) surfaces them automatically, and Deploy/Save re-run
    // findRecipeIdCollisions as their own hard gate, so a duplicate id can never
    // be published. Collecting them into `warnings` too would render the same
    // collision twice. (Was a hard reject before #1051.)

    // Server validate → warn-and-load on contract failure. Skip when
    // unresolvableRefs are already flagged: the gate would only fail on the very
    // refs we're choosing to tolerate. The request *itself* throwing is an
    // infrastructure error, not a recipe defect, so it stays a hard error.
    if (unresolvableRefs.length === 0) {
      try {
        const serialized = serializeRecipeDraft(incoming, { version });
        const raw = (await validateRecipe({
          data: { recipe: serialized },
        })) as ValidationResult;
        if (!raw.ok) {
          warnings.push(
            ...raw.issues.map((i) => ({ path: i.path ?? "", message: i.message })),
          );
        }
      } catch (e) {
        return {
          applied: false,
          error: e instanceof Error ? e.message : "Validation request failed.",
        };
      }
    }

    // Guard against silently discarding unsaved work already in the editor.
    // Gate on hasUnsavedChanges (not isDirty): replacing a clean, just-loaded
    // form loses nothing (Discard reverts to the saved baseline), so only the
    // presence of unsaved edits warrants a prompt. The message is explicit that
    // the apply only updates the editor and isn't saved.
    if (
      hasUnsavedChanges &&
      !window.confirm(
        "Apply the AI changes to the editor? This replaces the current form and isn't saved — you can Discard to undo, or Save draft to keep it.",
      )
    ) {
      return { applied: false, reason: "cancelled" };
    }

    dispatch({ type: "LOAD_DRAFT", draft: incoming });
    // Mirror handleLoad: open the first step of the freshly applied recipe.
    setSelectedStepId(firstStepId(incoming));
    setMainView("step");
    // Surface any collected defects as non-blocking warnings in the existing
    // validation panel; otherwise clear it.
    if (warnings.length > 0) {
      setValidateResult({ valid: false, issues: warnings });
      setLastSaveStatus("error");
    } else {
      setValidateResult(null);
      setLastSaveStatus("idle");
    }
    setSubmitSuccess(false);
    setSubmitError(null);
    // The recipe changed, so cut a fresh patch off the working version.
    setVersion((v) => bumpPatch(v));
    return { applied: true };
  };

  const handleNew = () => {
    dispatch({ type: "RESET" });
    // No saved baseline for a fresh form — unsaved tracking falls back to
    // isDirty until the first save/load.
    setSavedDraft(null);
    setSelectedStepId(null);
    setMainView("step");
    setVersion("1.0.0");
    setCurrentVersion(null);
    setLoadedFromId(null);
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setLastSaveStatus("idle");
    // Close all open panels/modals
    setIsPickerOpen(false);
    setIsSubmitOpen(false);
    setIsPreviewOpen(false);
    // Clear transient errors
    setPreviewError(null);
  };

  // Throw away unsaved work. With a saved baseline, revert the editor to it
  // (and its version); with none (brand-new form), clear the form — same as
  // New. Confirm-gated; the toolbar already disables this when there's nothing
  // unsaved.
  const handleDiscard = () => {
    const message =
      savedDraft === null
        ? "Discard unsaved changes and clear the form?"
        : "Discard unsaved changes and revert to the last saved version?";
    if (!window.confirm(message)) return;
    if (savedDraft === null) {
      handleNew();
      return;
    }
    dispatch({ type: "LOAD_DRAFT", draft: savedDraft });
    setSelectedStepId(firstStepId(savedDraft));
    setMainView("step");
    setVersion(currentVersion ?? "1.0.0");
    setValidateResult(null);
    setSubmitSuccess(false);
    setSubmitError(null);
    setPreviewData(null);
    setPreviewRecipeJson(null);
    setPreviewError(null);
    setLastSaveStatus("idle");
  };

  const handleRequestDelete = (form: FormDefinitionSummary) => {
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
      if (loadedFromId === deleteTarget.formId) handleNew();
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

  const handleRequestDisable = (form: FormDefinitionSummary) => {
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

  const handleRequestErase = (form: FormDefinitionSummary) => {
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
  const handleEnable = async (form: FormDefinitionSummary) => {
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

  const handleFormIdChange = (id: string) => {
    dispatch({ type: "SET_FORM_META", formId: id, title: draft.title, description: draft.description });
  };

  const handleTitleChange = (title: string) => {
    dispatch({ type: "SET_FORM_META", formId: draft.formId, title, description: draft.description });
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

  return (
    <div className={styles.builderShell}>
      <div className={styles.builderRoot}>
      {isReadOnly && presenceHolder && (
        <PresenceBanner holder={presenceHolder} />
      )}
      <Toolbar
        formId={draft.formId}
        title={draft.title}
        version={version}
        idError={uniqueness.idError}
        isDirty={isDirty}
        hasUnsavedChanges={hasUnsavedChanges}
        isValidating={isValidating}
        isPreviewing={isPreviewing}
        isSubmitting={isSubmitting}
        isPublishing={isPublishing}
        isReadOnly={isReadOnly}
        lastSaveStatus={lastSaveStatus}
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

      <div className={styles.builderBody}>
        <StepList
          steps={draft.steps}
          selectedStepId={mainView === "step" ? selectedStepId : null}
          onSelect={handleSelectStep}
          onAdd={handleAddStep}
          onRemove={handleRemoveStep}
          onMoveUp={handleMoveStepUp}
          onMoveDown={handleMoveStepDown}
          processorCount={draft.processors?.length ?? 0}
          isProcessorsActive={mainView === "processors"}
          onSelectProcessors={handleSelectProcessors}
          hasContactDetails={draft.contactDetails !== undefined}
          isContactDetailsActive={mainView === "contactDetails"}
          onSelectContactDetails={handleSelectContactDetails}
        />

        {mainView === "contactDetails" ? (
          <ContactDetailsEditor
            draft={draft}
            dispatch={dispatch}
            contacts={mdaContacts}
            contactsLoadError={mdaContactsLoadError}
            onCreateContact={handleCreateMdaContact}
          />
        ) : mainView === "processors" ? (
          <ProcessorsEditor
            draft={draft}
            dispatch={dispatch}
            fields={resolvedFieldIds}
          />
        ) : selectedStep !== null ? (
          <StepEditor
            step={selectedStep}
            draft={draft}
            dispatch={dispatch}
            catalog={catalog}
            onStepIdChange={handleStepIdChange}
          />
        ) : (
          <div className={styles.noStepSelected}>Select or add a step to begin</div>
        )}
      </div>

      {hasIdCollisions && (
        <div className={styles.validationErrors} role="alert">
          <strong>Duplicate IDs must be fixed before saving or deploying</strong>
          <ul>
            {idCollisions.fieldIdCollisions.map((c) => (
              <li key={`field-${c.id}`}>
                Field ID <code>{c.id}</code> is used by {c.locations.length}{" "}
                fields:{" "}
                {c.locations
                  .map((l) => `${l.stepTitle || l.stepId} › ${l.display}`)
                  .join("; ")}
              </li>
            ))}
            {idCollisions.stepIdCollisions.map((c) => (
              <li key={`step-${c.stepId}`}>
                Step ID <code>{c.stepId}</code> is used by {c.locations.length}{" "}
                steps:{" "}
                {c.locations.map((l) => l.stepTitle || l.stepId).join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ValidationPanel result={validateResult} onDismiss={handleDismissValidation} />

      {isPickerOpen && (
        <FormPicker
          forms={forms}
          loadError={formsLoadError}
          isDirty={isDirty}
          catalog={catalog}
          onLoad={handleLoad}
          onClose={() => setIsPickerOpen(false)}
          onRequestDelete={handleRequestDelete}
          onRequestDisable={handleRequestDisable}
          onRequestErase={handleRequestErase}
          onEnable={handleEnable}
        />
      )}

      {isPreviewOpen && (
        <PreviewModal
          contract={previewData}
          isLoading={isPreviewing}
          error={previewError}
          previewUrl={loadedFromId ? formPreviewUrl(loadedFromId) : null}
          recipe={previewRecipeJson}
          onClose={() => { setIsPreviewOpen(false); setPreviewData(null); setPreviewError(null); setPreviewRecipeJson(null); }}
        />
      )}

      {isSubmitOpen && (
        <SubmitModal
          draft={draft}
          version={saveDraftVersion}
          currentVersion={currentVersion}
          currentVersionIsPublished={currentVersionIsPublished}
          loadedFromId={loadedFromId}
          isSubmitting={isSubmitting}
          submitSuccess={submitSuccess}
          submitError={submitError}
          isReadOnly={isReadOnly}
          onSubmit={handleSubmit}
          onClose={() => setIsSubmitOpen(false)}
        />
      )}

      {isPublishOpen && (
        <PublishModal
          draft={draft}
          version={deployTarget}
          baseBranch={baseBranch}
          isPublishing={isPublishing}
          publishSuccess={publishSuccess}
          publishError={publishError}
          isReadOnly={isReadOnly}
          onPublish={handlePublish}
          onClose={handleClosePublish}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          formId={deleteTarget.formId}
          title={deleteTarget.title}
          isDeleting={isDeleting}
          deleteError={deleteError}
          onConfirm={handleConfirmDelete}
          onClose={handleCloseDelete}
        />
      )}

      {disableTarget && (
        <DisableModal
          formId={disableTarget.formId}
          title={disableTarget.title}
          isDisabling={isDisabling}
          disableError={disableError}
          onConfirm={handleConfirmDisable}
          onClose={handleCloseDisable}
        />
      )}

      {eraseTarget && (
        <EraseModal
          formId={eraseTarget.formId}
          title={eraseTarget.title}
          isErasing={isErasing}
          eraseSuccess={eraseSuccess}
          eraseError={eraseError}
          onConfirm={handleConfirmErase}
          onClose={handleCloseErase}
        />
      )}
      </div>

      <AiSidebar
        draft={draft}
        version={version}
        onApplyRecipe={applyAiRecipe}
      />
    </div>
  );
}
