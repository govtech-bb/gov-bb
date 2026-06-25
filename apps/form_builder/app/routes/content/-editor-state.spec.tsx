/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useEditorState } from "./-editor-state";
import { draftKeyFor, readDraft } from "./-draft-store";

// A new page's autosave target is the empty init signature.
const NEW_KEY = draftKeyFor(":");

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const renderEditor = () =>
  renderHook(() => useEditorState([], {}, []));

describe("useEditorState autosave", () => {
  it("debounce-persists edits to localStorage", () => {
    const { result } = renderEditor();
    act(() => result.current.set("title", "Renew passport"));

    // Nothing written until the debounce elapses.
    expect(readDraft(NEW_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(400));

    expect(readDraft<{ title: string }>(NEW_KEY)?.title).toBe("Renew passport");
    expect(result.current.draftSaved).toBe(true);
  });

  it("restores a stored draft when the editor reopens", () => {
    const first = renderEditor();
    act(() => first.result.current.set("title", "Apply for a grant"));
    act(() => vi.advanceTimersByTime(400));
    first.unmount();

    const { result } = renderEditor();
    expect(result.current.state.title).toBe("Apply for a grant");
    expect(result.current.dirty).toBe(true);
  });

  it("discardDraft clears storage and reverts to the baseline", () => {
    const { result } = renderEditor();
    act(() => result.current.set("title", "Draft title"));
    act(() => vi.advanceTimersByTime(400));
    expect(readDraft(NEW_KEY)).not.toBeNull();

    act(() => result.current.discardDraft());
    expect(readDraft(NEW_KEY)).toBeNull();
    expect(result.current.state.title).toBe("");
    expect(result.current.dirty).toBe(false);
  });

  it("markSaved clears the stored draft (deploy path)", () => {
    const { result } = renderEditor();
    act(() => result.current.set("title", "Shipping"));
    act(() => vi.advanceTimersByTime(400));
    expect(readDraft(NEW_KEY)).not.toBeNull();

    act(() => result.current.markSaved());
    expect(readDraft(NEW_KEY)).toBeNull();
  });
});

describe("useEditorState deployBlockReason", () => {
  it("names the first unmet condition, in canDeploy order", () => {
    const { result } = renderEditor();
    expect(result.current.deployBlockReason).toBe("Add a title");

    act(() => result.current.set("title", "Renew passport"));
    expect(result.current.deployBlockReason).toBe("Add page content");
  });

  it("is null exactly when the page can deploy", () => {
    const { result } = renderEditor();
    expect(result.current.canDeploy).toBe(false);
    expect(result.current.deployBlockReason).not.toBeNull();

    act(() => {
      result.current.set("title", "Renew passport");
      result.current.set("body", "How to renew your passport.");
      result.current.set("slug", "renew-passport");
      result.current.set("linkType", "none");
    });

    expect(result.current.canDeploy).toBe(true);
    expect(result.current.deployBlockReason).toBeNull();
  });
});
