/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useRecipeSave } from "./-use-recipe-save";
import { EMPTY_DRAFT } from "./-recipe-reducer";
import type { RecipeDraft } from "@govtech-bb/form-builder";

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
      const draft: RecipeDraft = { ...EMPTY_DRAFT, formId: "passport", title: "Passport" };
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
      const draft: RecipeDraft = { ...EMPTY_DRAFT, formId: "passport", title: "Passport" };
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
      const draft: RecipeDraft = { ...EMPTY_DRAFT, formId: "new-id", title: "New" };
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
      expect(result.current.publishSuccess).toEqual({ prUrl: "u", prNumber: 1 });
      expect(result.current.isPublishing).toBe(false);
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
    it("closes the modal and clears publish state", async () => {
      publishRecipe.mockResolvedValue({ prUrl: "u", prNumber: 1 });
      const { result } = render({ hasUnsavedChanges: false });

      await act(async () => {
        await result.current.handlePublish("desc");
      });
      act(() => {
        result.current.handleOpenPublish();
      });
      expect(result.current.isPublishOpen).toBe(true);

      act(() => {
        result.current.handleClosePublish();
      });

      expect(result.current.isPublishOpen).toBe(false);
      expect(result.current.publishSuccess).toBeNull();
      expect(result.current.publishError).toBeNull();
    });
  });
});
