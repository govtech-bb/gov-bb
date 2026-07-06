import { useState } from "react";
import {
  serializeRecipeDraft,
  extractDbProcessors,
} from "@govtech-bb/form-builder";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { submitRecipe, updateRecipe, rekeyRecipe } from "../../server/forms";
import { publishRecipe } from "../../server/publish";
import type { BuilderFormSummary } from "../../types/index";

interface UseRecipeSaveParams {
  draft: RecipeDraft;
  loadedFromId: string | null;
  forms: BuilderFormSummary[] | null;
  /** Live unsaved-changes flag — the Deploy handler hard-gates on it (#331). */
  hasUnsavedChanges: boolean;
  setSavedDraft: (draft: RecipeDraft | null) => void;
  setLoadedFromId: (id: string | null) => void;
  /** From useRecipeValidation — a successful save writes the shared verdict. */
  setLastSaveStatus: (
    status: "idle" | "success" | "error" | "submitted",
  ) => void;
  upsertForm: (summary: BuilderFormSummary) => void;
  refetchForms: () => void;
}

/**
 * Owns the save + deploy flow: the submit state (isSubmitting / submitSuccess /
 * submitError), the publish state and modal (isPublishOpen / isPublishing /
 * publishSuccess / publishError), and their handlers. Exposes setSubmitSuccess
 * + setSubmitError so the Save-draft click and the draft-lifecycle handlers can
 * reset the submit banner they share.
 */
export function useRecipeSave({
  draft,
  loadedFromId,
  forms,
  hasUnsavedChanges,
  setSavedDraft,
  setLoadedFromId,
  setLastSaveStatus,
  upsertForm,
  refetchForms,
}: UseRecipeSaveParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<{
    prUrl: string;
    prNumber: number;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const recipe = serializeRecipeDraft(draft);
      // Three save shapes, branching on the loaded id (captured before
      // setLoadedFromId below overwrites loadedFromId — the picker refresh
      // branches on these too):
      //  - create: nothing was loaded, so this is a brand-new form.
      //  - re-key (#674): a loaded form whose id was changed — an atomic
      //    identity move, not a create (which would self-collide on title and
      //    leave a stale old-id row).
      //  - in-place update: the loaded id is unchanged.
      const oldFormId = loadedFromId;
      const isCreate = oldFormId === null;
      // An empty id is never a re-key — it's left to the "Form ID is required"
      // gate (mirrors checkRekeyPublished, which excludes empties too), so a
      // cleared id on a save-anyway doesn't round-trip to the rekey endpoint.
      const isRekey =
        oldFormId !== null && draft.formId !== "" && draft.formId !== oldFormId;
      // #1196: one scratch row per form — saving a loaded form (same id) always
      // overwrites that row in place; there is no new-version fork.
      const isInPlaceUpdate = !!oldFormId && draft.formId === oldFormId;
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
          // #1196: version is a frozen breadcrumb from the API list; preserve it.
          version: existing?.version ?? "",
          // Saving a draft never changes published-index membership, so preserve
          // it: a never-published draft stays unpublished, a published form keeps
          // its badge.
          isPublished: existing?.isPublished ?? false,
          publishedVersion: existing?.publishedVersion,
        });
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenPublish = () => {
    // #1196: publishing overwrites the canonical flat file — there is no
    // deploy-version to resolve, so just open the modal.
    setPublishSuccess(null);
    setPublishError(null);
    setIsPublishOpen(true);
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
    setIsPublishing(true);
    setPublishError(null);
    try {
      const recipe = serializeRecipeDraft(draft);
      const result = await publishRecipe({ data: { recipe, description } });
      setPublishSuccess(result);
      // Deploy opens a review PR; the published index is unchanged until it
      // merges — preserve the existing picker row.
      const existing = forms?.find((f) => f.formId === draft.formId);
      upsertForm({
        id: existing?.id ?? draft.formId,
        formId: draft.formId,
        title: draft.title,
        version: existing?.version ?? "",
        isPublished: false,
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

  return {
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
  };
}
