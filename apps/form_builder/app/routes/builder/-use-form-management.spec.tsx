/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useFormManagement } from "./-use-form-management";
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
      expect(result.current.deleteTarget).toBeNull();
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
      expect(result.current.disableTarget).toBeNull();
    });
  });

  describe("handleEnable", () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("calls enableForm and refetches when confirmed", async () => {
      confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      enableForm.mockResolvedValue(undefined);
      const { result, refetchForms } = render();

      await act(async () => {
        await result.current.handleEnable(passport);
      });

      expect(enableForm).toHaveBeenCalledWith({ data: { formId: "passport" } });
      expect(refetchForms).toHaveBeenCalledTimes(1);
    });

    it("does nothing when the confirm is declined", async () => {
      confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { result, refetchForms } = render();

      await act(async () => {
        await result.current.handleEnable(passport);
      });

      expect(enableForm).not.toHaveBeenCalled();
      expect(refetchForms).not.toHaveBeenCalled();
    });
  });
});
