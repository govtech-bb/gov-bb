import { respondToConfirmation } from "../../test/ui";
/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "../../test/ui";
import { useFormManagement } from "./use-form-management";
import type { BuilderFormSummary } from "../../types/index";

// Bare vi.fn's (rather than vi.mocked on the real createServerFn fetchers) so
// mockResolvedValue isn't fighting the fetcher's return type — same pattern as
// index.spec.tsx. The factories delegate lazily so the hoisted vi.mock is fine.
const deleteForm = vi.fn();
const disableForm = vi.fn();
const enableForm = vi.fn();
vi.mock("../../server/forms", () => ({
  deleteForm: (...args: unknown[]) => deleteForm(...args),
  disableForm: (...args: unknown[]) => disableForm(...args),
  enableForm: (...args: unknown[]) => enableForm(...args),
}));

const eraseRecipe = vi.fn();
vi.mock("../../server/publish", () => ({
  eraseRecipe: (...args: unknown[]) => eraseRecipe(...args),
}));

const passport: BuilderFormSummary = {
  id: "passport",
  formId: "passport",
  title: "Passport",
  version: "1.0.0",
  isPublished: true,
};

type Params = Parameters<typeof useFormManagement>[0];

function render(overrides: Partial<Params> = {}) {
  const onClearEditor = vi.fn();
  const refetchForms = vi.fn();
  const setIsPickerOpen = vi.fn();
  const hook = renderHook(() =>
    useFormManagement({
      loadedFromId: null,
      onClearEditor,
      refetchForms,
      setIsPickerOpen,
      ...overrides,
    }),
  );
  return {
    ...hook,
    onClearEditor,
    refetchForms,
    setIsPickerOpen,
  };
}

describe("useFormManagement", () => {
  beforeEach(() => {
    deleteForm.mockReset();
    disableForm.mockReset();
    enableForm.mockReset();
    eraseRecipe.mockReset();
  });

  describe("handleRequestDelete", () => {
    it("sets deleteTarget and closes the picker", () => {
      const { result, setIsPickerOpen } = render();

      act(() => {
        result.current.handleRequestDelete(passport);
      });

      expect(result.current.deleteTarget).toEqual(passport);
      expect(result.current.isDeleteOpen).toBe(true);
      expect(setIsPickerOpen).toHaveBeenCalledWith(false);
    });
  });

  describe("handleConfirmDelete", () => {
    it("calls deleteForm, clears the editor when the deleted form is open, and refetches", async () => {
      deleteForm.mockResolvedValue(undefined);
      const { result, onClearEditor, refetchForms } = render({
        loadedFromId: "passport",
      });

      act(() => {
        result.current.handleRequestDelete(passport);
      });

      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(deleteForm).toHaveBeenCalledWith({ data: { formId: "passport" } });
      expect(onClearEditor).toHaveBeenCalledTimes(1);
      expect(refetchForms).toHaveBeenCalledTimes(1);
      expect(result.current.isDeleteOpen).toBe(false);
      expect(result.current.deleteTarget).toEqual(passport);
    });

    it("does not clear the editor when the deleted form is not open", async () => {
      deleteForm.mockResolvedValue(undefined);
      const { result, onClearEditor, refetchForms } = render({
        loadedFromId: "other-form",
      });

      act(() => {
        result.current.handleRequestDelete(passport);
      });

      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(onClearEditor).not.toHaveBeenCalled();
      expect(refetchForms).toHaveBeenCalledTimes(1);
    });
  });

  describe("handleConfirmDisable", () => {
    it("calls disableForm and refetches", async () => {
      disableForm.mockResolvedValue(undefined);
      const { result, refetchForms } = render();

      act(() => {
        result.current.handleRequestDisable(passport);
      });

      await act(async () => {
        await result.current.handleConfirmDisable("no longer needed");
      });

      expect(disableForm).toHaveBeenCalledWith({
        data: { formId: "passport", reason: "no longer needed" },
      });
      expect(refetchForms).toHaveBeenCalledTimes(1);
      expect(result.current.isDisableOpen).toBe(false);
      expect(result.current.disableTarget).toEqual(passport);
    });
  });

  it("retains the erase result while closing and clears it for the next request", async () => {
    const success = {
      prUrl: "https://github.com/example/repo/pull/1",
      prNumber: 1,
    };
    eraseRecipe.mockResolvedValue(success);
    const { result } = render();

    act(() => result.current.handleRequestErase(passport));
    await act(async () => {
      await result.current.handleConfirmErase("Retired service");
    });
    act(() => result.current.handleCloseErase());

    expect(result.current.isEraseOpen).toBe(false);
    expect(result.current.eraseTarget).toEqual(passport);
    expect(result.current.eraseSuccess).toEqual(success);

    act(() => result.current.handleRequestErase(passport));
    expect(result.current.isEraseOpen).toBe(true);
    expect(result.current.eraseSuccess).toBeNull();
  });

  describe("handleEnable", () => {
    it("calls enableForm and refetches when confirmed", async () => {
      enableForm.mockResolvedValue(undefined);
      const { result, refetchForms } = render();

      act(() => {
        void result.current.handleEnable(passport);
      });
      await respondToConfirmation("Re-enable");

      expect(enableForm).toHaveBeenCalledWith({ data: { formId: "passport" } });
      expect(refetchForms).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the confirm is declined", async () => {
      const { result, refetchForms } = render();

      act(() => {
        void result.current.handleEnable(passport);
      });
      await respondToConfirmation("Cancel");

      expect(enableForm).not.toHaveBeenCalled();
      expect(refetchForms).not.toHaveBeenCalled();
    });
  });
});
