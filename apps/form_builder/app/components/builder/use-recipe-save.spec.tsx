/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useRecipeSave } from "./use-recipe-save";
import { EMPTY_DRAFT } from "./recipe-reducer";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import type { ServiceDraft } from "@govtech-bb/form-types";
import { ServiceDraftConflictError } from "../../lib/service-drafts";

// Bare vi.fn's (rather than vi.mocked on the real createServerFn fetchers) so
// mockResolvedValue isn't fighting the fetcher's return type — same pattern as
// index.spec.tsx. The factories delegate lazily so the hoisted vi.mock is fine.
const submitRecipe = vi.fn();
const updateRecipe = vi.fn();
const rekeyRecipe = vi.fn();
vi.mock("../../server/forms", () => ({
  submitRecipe: (...args: unknown[]) => submitRecipe(...args),
  updateRecipe: (...args: unknown[]) => updateRecipe(...args),
  rekeyRecipe: (...args: unknown[]) => rekeyRecipe(...args),
}));

const publishRecipe = vi.fn();
vi.mock("../../server/publish", () => ({
  publishRecipe: (...args: unknown[]) => publishRecipe(...args),
}));

const saveServiceForm = vi.fn();
const getServiceDraft = vi.fn();
vi.mock("../../lib/service-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/service-drafts")>()),
  saveServiceForm: (...args: unknown[]) => saveServiceForm(...args),
  getServiceDraft: (...args: unknown[]) => getServiceDraft(...args),
}));

type Params = Parameters<typeof useRecipeSave>[0];

function render(overrides: Partial<Params> = {}) {
  const setSavedDraft = vi.fn();
  const setLoadedFromId = vi.fn();
  const setLastSaveStatus = vi.fn();
  const upsertForm = vi.fn();
  const refetchForms = vi.fn();
  const hook = renderHook(() =>
    useRecipeSave({
      draft: EMPTY_DRAFT,
      loadedFromId: null,
      loadedSourceSha: null,
      forms: null,
      hasUnsavedChanges: false,
      setSavedDraft,
      setLoadedFromId,
      setLastSaveStatus,
      upsertForm,
      refetchForms,
      ...overrides,
    }),
  );
  return {
    ...hook,
    setSavedDraft,
    setLoadedFromId,
    setLastSaveStatus,
    upsertForm,
    refetchForms,
  };
}

describe("useRecipeSave", () => {
  beforeEach(() => {
    submitRecipe.mockReset();
    updateRecipe.mockReset();
    rekeyRecipe.mockReset();
    publishRecipe.mockReset();
  });

  describe("handleSubmit", () => {
    it("creates a new form when nothing was loaded", async () => {
      submitRecipe.mockResolvedValue(undefined);
      const draft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "passport",
        title: "Passport",
      };
      const {
        result,
        setLastSaveStatus,
        setSavedDraft,
        setLoadedFromId,
        refetchForms,
        upsertForm,
      } = render({ draft, loadedFromId: null });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(submitRecipe).toHaveBeenCalledTimes(1);
      expect(updateRecipe).not.toHaveBeenCalled();
      expect(rekeyRecipe).not.toHaveBeenCalled();
      expect(setLastSaveStatus).toHaveBeenCalledWith("submitted");
      expect(setSavedDraft).toHaveBeenCalledWith(draft);
      expect(setLoadedFromId).toHaveBeenCalledWith("passport");
      expect(refetchForms).toHaveBeenCalledTimes(1);
      expect(upsertForm).not.toHaveBeenCalled();
      expect(result.current.submitSuccess).toBe(true);
    });

    it("updates in place when the loaded id is unchanged", async () => {
      updateRecipe.mockResolvedValue(undefined);
      const draft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "passport",
        title: "Passport",
      };
      const { result, upsertForm, refetchForms } = render({
        draft,
        loadedFromId: "passport",
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(updateRecipe).toHaveBeenCalledTimes(1);
      expect(submitRecipe).not.toHaveBeenCalled();
      expect(rekeyRecipe).not.toHaveBeenCalled();
      expect(upsertForm).toHaveBeenCalledTimes(1);
      expect(refetchForms).not.toHaveBeenCalled();
    });

    it("re-keys when the loaded id differs from the draft's formId", async () => {
      rekeyRecipe.mockResolvedValue(undefined);
      const draft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "new-id",
        title: "New",
      };
      const { result, refetchForms } = render({
        draft,
        loadedFromId: "old-id",
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(rekeyRecipe).toHaveBeenCalledTimes(1);
      expect(submitRecipe).not.toHaveBeenCalled();
      expect(updateRecipe).not.toHaveBeenCalled();
      expect(refetchForms).toHaveBeenCalledTimes(1);
    });
  });

  // #3864: a service form save that conflicts with a newer version.
  describe("handleSubmit for a service form", () => {
    const serviceDraft = {
      manifest: { serviceId: "test-service" },
      pendingConfig: { mdaContactId: null, processors: null },
      revision: 3,
    } as unknown as ServiceDraft;
    const draft: RecipeDraft = {
      ...EMPTY_DRAFT,
      formId: "passport",
      title: "Passport",
    };
    const conflict = () =>
      new ServiceDraftConflictError("This service changed after you opened it");
    beforeEach(() => {
      saveServiceForm.mockReset();
      getServiceDraft.mockReset();
    });

    it("saves over the newer version at its revision when the author confirms", async () => {
      const saved = { ...serviceDraft, revision: 6 };
      saveServiceForm
        .mockRejectedValueOnce(conflict())
        .mockResolvedValueOnce(saved);
      getServiceDraft.mockResolvedValue({ ...serviceDraft, revision: 5 });
      const onServiceSaved = vi.fn();
      const confirmOverwrite = vi.fn().mockResolvedValue(true);
      const { result, setSavedDraft } = render({
        draft,
        loadedFromId: "passport",
        serviceDraft,
        onServiceSaved,
        confirmOverwrite,
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(confirmOverwrite).toHaveBeenCalledOnce();
      expect(
        saveServiceForm.mock.calls.map(([arg]) => arg.data.expectedRevision),
      ).toEqual([3, 5]);
      expect(onServiceSaved).toHaveBeenCalledWith(saved);
      expect(setSavedDraft).toHaveBeenCalledWith(draft);
      expect(result.current.submitError).toBeNull();
    });

    it("keeps the editor's changes unsaved and shows the conflict when the author cancels", async () => {
      saveServiceForm.mockRejectedValue(conflict());
      const confirmOverwrite = vi.fn().mockResolvedValue(false);
      const { result, setSavedDraft } = render({
        draft,
        loadedFromId: "passport",
        serviceDraft,
        confirmOverwrite,
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(saveServiceForm).toHaveBeenCalledOnce();
      expect(getServiceDraft).not.toHaveBeenCalled();
      expect(setSavedDraft).not.toHaveBeenCalled();
      expect(result.current.submitError).toContain(
        "changed after you opened it",
      );
    });

    it("does not offer to overwrite on other save errors", async () => {
      saveServiceForm.mockRejectedValue(new Error("Forms API unavailable"));
      const confirmOverwrite = vi.fn();
      const { result } = render({
        draft,
        loadedFromId: "passport",
        serviceDraft,
        confirmOverwrite,
      });

      await act(async () => {
        await result.current.handleSubmit();
      });

      expect(confirmOverwrite).not.toHaveBeenCalled();
      expect(result.current.submitError).toBe("Forms API unavailable");
    });
  });

  describe("handlePublish", () => {
    it("hard-gates on unsaved changes without calling publishRecipe", async () => {
      const { result } = render({ hasUnsavedChanges: true });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(publishRecipe).not.toHaveBeenCalled();
      expect(result.current.publishError).toBe("Save draft before deploying.");
    });

    it("publishes successfully when there are no unsaved changes", async () => {
      publishRecipe.mockResolvedValue({ prUrl: "u", prNumber: 1 });
      const { result } = render({ hasUnsavedChanges: false });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(publishRecipe).toHaveBeenCalledTimes(1);
      expect(result.current.publishSuccess).toEqual({
        prUrl: "u",
        prNumber: 1,
      });
      expect(result.current.isPublishing).toBe(false);
    });

    it("refetches the forms list after a successful deploy so the badge appears", async () => {
      // openPRs comes from GitHub, so unlike the row patch it can't be derived
      // locally — without this the just-deployed form shows no "In review"
      // badge until the next picker mount (#2390).
      publishRecipe.mockResolvedValue({
        prUrl: "u",
        prNumber: 1,
        updatedExistingPR: false,
      });
      const { result, refetchForms } = render({ hasUnsavedChanges: false });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(refetchForms).toHaveBeenCalledTimes(1);
    });

    it("sends the loaded source sha as expectedSourceSha so the server can refuse a stale base (#2489)", async () => {
      publishRecipe.mockResolvedValue({
        prUrl: "u",
        prNumber: 1,
        updatedExistingPR: false,
      });
      const sha = "3f786850e387550fdab836ed7e6dc881de23001b";
      const { result } = render({
        hasUnsavedChanges: false,
        loadedSourceSha: sha,
      });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(publishRecipe).toHaveBeenCalledWith({
        data: expect.objectContaining({ expectedSourceSha: sha }),
      });
    });

    it("sends expectedSourceSha: null (not omitted) for a form with no committed copy", async () => {
      // The server requires the key: a Deploy that cannot say what it loaded
      // is refused, so a first publish must state "nothing" explicitly.
      publishRecipe.mockResolvedValue({
        prUrl: "u",
        prNumber: 1,
        updatedExistingPR: false,
      });
      const { result } = render({
        hasUnsavedChanges: false,
        loadedSourceSha: null,
      });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(publishRecipe.mock.calls[0][0].data).toHaveProperty(
        "expectedSourceSha",
        null,
      );
    });

    it("does not refetch when the deploy fails", async () => {
      publishRecipe.mockRejectedValue(new Error("boom"));
      const { result, refetchForms } = render({ hasUnsavedChanges: false });

      await act(async () => {
        await result.current.handlePublish("desc");
      });

      expect(result.current.publishError).toBe("boom");
      expect(refetchForms).not.toHaveBeenCalled();
    });
  });

  describe("handleOpenPublish", () => {
    it("opens the modal and clears prior publish state", async () => {
      publishRecipe.mockResolvedValue({ prUrl: "u", prNumber: 1 });
      const { result } = render({ hasUnsavedChanges: false });

      await act(async () => {
        await result.current.handlePublish("desc");
      });
      expect(result.current.publishSuccess).not.toBeNull();

      act(() => {
        result.current.handleOpenPublish();
      });

      expect(result.current.isPublishOpen).toBe(true);
      expect(result.current.publishSuccess).toBeNull();
      expect(result.current.publishError).toBeNull();
    });
  });

  describe("handleClosePublish", () => {
    it("retains the publish result during the closing animation", async () => {
      publishRecipe.mockResolvedValue({ prUrl: "u", prNumber: 1 });
      const { result } = render({ hasUnsavedChanges: false });

      act(() => {
        result.current.handleOpenPublish();
      });
      await act(async () => {
        await result.current.handlePublish("desc");
      });
      expect(result.current.isPublishOpen).toBe(true);

      act(() => {
        result.current.handleClosePublish();
      });

      expect(result.current.isPublishOpen).toBe(false);
      expect(result.current.publishSuccess).toEqual({
        prUrl: "u",
        prNumber: 1,
      });
      expect(result.current.publishError).toBeNull();
    });
  });
});
