/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useFormsList } from "./-use-forms-list";
import { listForms } from "../../server/forms";
import type { FormDefinitionSummary } from "../../types/index";

jest.mock("../../server/forms", () => ({
  listForms: jest.fn(),
}));

const mockListForms = jest.mocked(listForms);

const FORMS: FormDefinitionSummary[] = [
  { id: "passport", formId: "passport", title: "Passport", version: "1.0.0", isPublished: true },
];

describe("useFormsList", () => {
  beforeEach(() => {
    mockListForms.mockReset();
  });

  it("starts loading: forms is null and there is no error", () => {
    // A promise that never settles keeps the hook in its initial state.
    mockListForms.mockReturnValue(new Promise<FormDefinitionSummary[]>(() => {}));
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
    let resolve!: (v: FormDefinitionSummary[]) => void;
    mockListForms.mockReturnValue(
      new Promise<FormDefinitionSummary[]>((r) => {
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
    mockListForms.mockReturnValue(new Promise<FormDefinitionSummary[]>(() => {}));
    renderHook(() => useFormsList());
    expect(mockListForms).toHaveBeenCalledTimes(1);
  });
});
