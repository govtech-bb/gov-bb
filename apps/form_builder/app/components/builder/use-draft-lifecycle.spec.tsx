import { respondToConfirmation } from "../../test/ui";
/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "../../test/ui";
import { useDraftLifecycle } from "./use-draft-lifecycle";
import { EMPTY_DRAFT } from "./recipe-reducer";
import type { RecipeDraft } from "@govtech-bb/form-builder";

// A bare vi.fn (rather than vi.mocked on the real createServerFn) so
// mockResolvedValue isn't fighting the fetcher's return type — same pattern as
// index.spec.tsx. The factory delegates lazily so the hoisted vi.mock is fine.
const validateRecipe = vi.fn();
vi.mock("../../server/registry", () => ({
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
}));

type Params = Parameters<typeof useDraftLifecycle>[0];

function render(overrides: Partial<Params> = {}) {
  const dispatch = vi.fn();
  const setSavedDraft = vi.fn();
  const setLoadedFromId = vi.fn();
  const setLoadedSourceSha = vi.fn();
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
      savedDraft: null,
      dispatch,
      setSavedDraft,
      setLoadedFromId,
      setLoadedSourceSha,
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
    setLoadedSourceSha,
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
        setLoadedSourceSha,
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
      // The source sha goes with the id: a New form has no committed copy to
      // vouch for at Deploy (#2489).
      expect(setLoadedSourceSha).toHaveBeenCalledWith(null);
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
        setLoadedSourceSha,
        setSavedDraft,
        setValidateResult,
        setLastSaveStatus,
      } = render();
      const sha = "3f786850e387550fdab836ed7e6dc881de23001b";

      act(() => {
        result.current.handleLoad(loadedDraft, "some-id", sha);
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "LOAD_DRAFT",
        draft: loadedDraft,
      });
      expect(setLoadedFromId).toHaveBeenCalledWith("some-id");
      // The committed sha the draft was loaded against rides with the id so
      // Deploy can refuse a stale base (#2489).
      expect(setLoadedSourceSha).toHaveBeenCalledWith(sha);
      expect(setSavedDraft).toHaveBeenCalledTimes(1);
      expect(setValidateResult).toHaveBeenCalledWith(null);
      expect(setLastSaveStatus).toHaveBeenCalledWith("idle");
    });
  });

  describe("handleDiscard", () => {
    it("does nothing when the confirm is declined", async () => {
      const { result, dispatch } = render({ savedDraft: null });

      act(() => {
        void result.current.handleDiscard();
      });
      await respondToConfirmation("Cancel");

      expect(dispatch).not.toHaveBeenCalled();
    });

    it("takes the clear-form path (delegates to New) when there's no saved baseline", async () => {
      const { result, dispatch, setSavedDraft } = render({ savedDraft: null });

      act(() => {
        void result.current.handleDiscard();
      });
      await respondToConfirmation("Discard changes");

      expect(dispatch).toHaveBeenCalledWith({ type: "RESET" });
      expect(setSavedDraft).toHaveBeenCalledWith(null);
    });

    it("reverts to the saved baseline (not RESET) when a saved draft exists", async () => {
      const savedDraft: RecipeDraft = {
        ...EMPTY_DRAFT,
        formId: "passport",
        title: "Passport",
      };
      const { result, dispatch } = render({ savedDraft });

      act(() => {
        void result.current.handleDiscard();
      });
      await respondToConfirmation("Discard changes");

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
      const {
        result,
        dispatch,
        setSavedDraft,
        setLoadedFromId,
        setLoadedSourceSha,
      } = render();

      act(() => {
        result.current.handleDuplicate(dupDraft);
      });

      expect(dispatch).toHaveBeenCalledWith({
        type: "LOAD_DRAFT",
        draft: dupDraft,
      });
      expect(setSavedDraft).toHaveBeenCalledWith(null);
      expect(setLoadedFromId).toHaveBeenCalledWith(null);
      // A copy is a brand-new form: it must not inherit the original's
      // committed sha, or its first Deploy would be refused as stale (#2489).
      expect(setLoadedSourceSha).toHaveBeenCalledWith(null);
    });
  });
});
