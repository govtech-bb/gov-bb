/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useDraftLifecycle } from "./-use-draft-lifecycle";
import { EMPTY_DRAFT } from "./-recipe-reducer";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

// A bare vi.fn (rather than vi.mocked on the real createServerFn) so
// mockResolvedValue isn't fighting the fetcher's return type — same pattern as
// index.spec.tsx. The factory delegates lazily so the hoisted vi.mock is fine.
const validateRecipe = vi.fn();
vi.mock("../../server/registry", () => ({
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
}));

const CATALOG: RegistryCatalog = { components: [], blocks: [], custom: [] };

type Params = Parameters<typeof useDraftLifecycle>[0];

function render(overrides: Partial<Params> = {}) {
  const dispatch = vi.fn();
  const setSavedDraft = vi.fn();
  const setLoadedFromId = vi.fn();
  const setSelectedStepId = vi.fn();
  const setMainView = vi.fn();
  const setValidateResult = vi.fn();
  const setLastSaveStatus = vi.fn();
  const setSubmitSuccess = vi.fn();
  const setSubmitError = vi.fn();
  const setPreviewData = vi.fn();
  const setPreviewRecipeJson = vi.fn();
  const setPreviewError = vi.fn();
  const setIsPickerOpen = vi.fn();
  const setIsSubmitOpen = vi.fn();
  const setIsPreviewOpen = vi.fn();
  const hook = renderHook(() =>
    useDraftLifecycle({
      draft: EMPTY_DRAFT,
      catalog: CATALOG,
      savedDraft: null,
      hasUnsavedChanges: false,
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
      ...overrides,
    }),
  );
  return {
    ...hook,
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
  };
}

describe("useDraftLifecycle", () => {
  beforeEach(() => {
    validateRecipe.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleNew", () => {
    it("resets the draft, clears identity/selection, and closes all modals", () => {
      const {
        result,
        dispatch,
        setSavedDraft,
        setLoadedFromId,
        setSelectedStepId,
        setIsPickerOpen,
        setIsSubmitOpen,
        setIsPreviewOpen,
        setLastSaveStatus,
      } = render();

      act(() => {
        result.current.handleNew();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "RESET" });
      expect(setSavedDraft).toHaveBeenCalledWith(null);
      expect(setLoadedFromId).toHaveBeenCalledWith(null);
      expect(setSelectedStepId).toHaveBeenCalledWith(null);
      expect(setIsPickerOpen).toHaveBeenCalledWith(false);
      expect(setIsSubmitOpen).toHaveBeenCalledWith(false);
      expect(setIsPreviewOpen).toHaveBeenCalledWith(false);
      expect(setLastSaveStatus).toHaveBeenCalledWith("idle");
    });
  });

  describe("handleLoad", () => {
    it("loads the draft, records the loaded id, and clears transient state", () => {
      const loadedDraft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "some-id",
        title: "Some Form",
      };
      const {
        result,
        dispatch,
        setLoadedFromId,
        setSavedDraft,
        setValidateResult,
        setLastSaveStatus,
      } = render();

      act(() => {
        result.current.handleLoad(loadedDraft, "some-id");
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "LOAD_DRAFT",
        draft: loadedDraft,
      });
      expect(setLoadedFromId).toHaveBeenCalledWith("some-id");
      expect(setSavedDraft).toHaveBeenCalledTimes(1);
      expect(setValidateResult).toHaveBeenCalledWith(null);
      expect(setLastSaveStatus).toHaveBeenCalledWith("idle");
    });
  });

  describe("handleDiscard", () => {
    it("does nothing when the confirm is declined", () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const { result, dispatch } = render({ savedDraft: null });

      act(() => {
        result.current.handleDiscard();
      });

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("takes the clear-form path (delegates to New) when there's no saved baseline", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const { result, dispatch, setSavedDraft } = render({ savedDraft: null });

      act(() => {
        result.current.handleDiscard();
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "RESET" });
      expect(setSavedDraft).toHaveBeenCalledWith(null);
    });

    it("reverts to the saved baseline (not RESET) when a saved draft exists", () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const savedDraft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "passport",
        title: "Passport",
      };
      const { result, dispatch } = render({ savedDraft });

      act(() => {
        result.current.handleDiscard();
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "LOAD_DRAFT",
        draft: savedDraft,
      });
      expect(dispatch).not.toHaveBeenCalledWith({ type: "RESET" });
    });
  });

  describe("handleDuplicate", () => {
    it("loads the duplicated draft as a brand-new unsaved form", () => {
      const dupDraft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "passport-copy",
        title: "Passport (copy)",
      };
      const { result, dispatch, setSavedDraft, setLoadedFromId } = render();

      act(() => {
        result.current.handleDuplicate(dupDraft);
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "LOAD_DRAFT",
        draft: dupDraft,
      });
      expect(setSavedDraft).toHaveBeenCalledWith(null);
      expect(setLoadedFromId).toHaveBeenCalledWith(null);
    });
  });
});
