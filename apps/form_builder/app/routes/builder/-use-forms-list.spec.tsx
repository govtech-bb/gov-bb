/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFormsList } from "./-use-forms-list";
import { listForms } from "../../server/forms";
import type { BuilderFormSummary } from "../../types/index";

vi.mock("../../server/forms", () => ({
  listForms: vi.fn(),
}));

const mockListForms = vi.mocked(listForms);

const FORMS: BuilderFormSummary[] = [
  { id: "passport", formId: "passport", title: "Passport", version: "1.0.0", isPublished: true },
];

describe("useFormsList", () => {
  beforeEach(() => {
    mockListForms.mockReset();
  });

  it("starts loading: forms is null and there is no error", () => {
    // A promise that never settles keeps the hook in its initial state.
    mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
    const { result } = renderHook(() => useFormsList());
    expect(result.current.forms).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it("populates forms once listForms resolves", async () => {
    mockListForms.mockResolvedValue(FORMS);
    const { result } = renderHook(() => useFormsList());
    await waitFor(() => expect(result.current.forms).toEqual(FORMS));
    expect(result.current.loadError).toBeNull();
  });

  it("sets loadError (and leaves forms null) when listForms rejects", async () => {
    mockListForms.mockRejectedValue(new Error("network boom"));
    const { result } = renderHook(() => useFormsList());
    await waitFor(() => expect(result.current.loadError).toBe("network boom"));
    expect(result.current.forms).toBeNull();
  });

  it("does not apply a late resolution after unmount", async () => {
    let resolve!: (v: BuilderFormSummary[]) => void;
    mockListForms.mockReturnValue(
      new Promise<BuilderFormSummary[]>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useFormsList());
    unmount();
    resolve(FORMS);
    await Promise.resolve();
    // The unmount guard must prevent a post-unmount state write; the last
    // rendered value stays at the loading state.
    expect(result.current.forms).toBeNull();
  });

  it("calls listForms exactly once on mount", () => {
    mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
    renderHook(() => useFormsList());
    expect(mockListForms).toHaveBeenCalledTimes(1);
  });

  describe("upsertForm", () => {
    it("replaces the matching formId entry in place without refetching", async () => {
      mockListForms.mockResolvedValue(FORMS);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));

      const updated: BuilderFormSummary = {
        id: "passport",
        formId: "passport",
        title: "Passport (renamed)",
        version: "2.0.0",
        isPublished: false,
      };
      act(() => result.current.upsertForm(updated));

      expect(result.current.forms).toEqual([updated]);
      // The cheap upsert must not trigger another slow listForms waterfall.
      expect(mockListForms).toHaveBeenCalledTimes(1);
    });

    it("appends when no entry with that formId exists yet", async () => {
      mockListForms.mockResolvedValue(FORMS);
      const { result } = renderHook(() => useFormsList());
      await waitFor(() => expect(result.current.forms).toEqual(FORMS));

      const added: BuilderFormSummary = {
        id: "licence",
        formId: "licence",
        title: "Driving Licence",
        version: "1.0.0",
        isPublished: false,
      };
      act(() => result.current.upsertForm(added));

      expect(result.current.forms).toEqual([...FORMS, added]);
    });

    it("no-ops while the list is still loading (forms is null)", () => {
      mockListForms.mockReturnValue(new Promise<BuilderFormSummary[]>(() => {}));
      const { result } = renderHook(() => useFormsList());
      expect(result.current.forms).toBeNull();

      act(() =>
        result.current.upsertForm({
          id: "licence",
          formId: "licence",
          title: "Driving Licence",
          version: "1.0.0",
          isPublished: false,
        }),
      );

      // Nothing to patch yet; the pending mount fetch still owns the eventual list.
      expect(result.current.forms).toBeNull();
    });
  });
});
