/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useEditorState } from "./-editor-state";
import { draftKeyFor, readDraft, writeDraft } from "./-draft-store";

const loadPageMock = vi.hoisted(() => vi.fn());
vi.mock("./-server", () => ({ loadLandingContentPage: loadPageMock }));

// A new page's autosave target is the empty init signature.
const NEW_KEY = draftKeyFor(":");

beforeEach(() => {
  localStorage.clear();
  loadPageMock.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const renderEditor = () => renderHook(() => useEditorState([], {}, []));

describe("useEditorState autosave", () => {
  it("debounce-persists edits to localStorage", () => {
    const { result } = renderEditor();
    act(() => result.current.set("title", "Renew passport"));

    // Nothing written until the debounce elapses.
    expect(readDraft(NEW_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(400));

    expect(readDraft<{ state: { title: string } }>(NEW_KEY)?.state.title).toBe(
      "Renew passport",
    );
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

  it("blocks a conflicting new-page deploy without calling the draft stale", () => {
    const { result } = renderEditor();
    act(() =>
      result.current.setDeployConflict({
        kind: "path-exists",
        message: "A page now exists at this path.",
        claims: [],
      }),
    );

    expect(result.current.canDeploy).toBe(false);
    expect(result.current.deployBlockReason).toBe(
      "A page now exists at this path.",
    );
    expect(result.current.staleDraft).toBe(false);

    act(() => result.current.set("slug", "another-page"));
    expect(result.current.deployConflict).toBeNull();
  });
});

describe("useEditorState revision-bound drafts", () => {
  it("ignores a slow page response after navigating to another page", async () => {
    const firstPath = "apps/landing/src/content/first.md";
    const secondPath = "apps/landing/src/content/second.md";
    let resolveFirst!: (page: unknown) => void;
    loadPageMock.mockImplementation(({ data }: { data: { path: string } }) => {
      if (data.path === firstPath) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        path: secondPath,
        sha: "second-sha",
        frontmatter: { title: "Second page", visibility: "draft" },
        body: "Second body",
        revision: { source: "base", sha: "second-sha" },
      });
    });

    const { result, rerender } = renderHook(
      ({ path }) => useEditorState([], { path }, [], true),
      { initialProps: { path: firstPath } },
    );
    rerender({ path: secondPath });
    await act(async () => Promise.resolve());

    await act(async () => {
      resolveFirst({
        path: firstPath,
        sha: "first-sha",
        frontmatter: { title: "First page", visibility: "draft" },
        body: "First body",
        revision: { source: "base", sha: "first-sha" },
      });
      await Promise.resolve();
    });

    expect(result.current.editPath).toBe(secondPath);
    expect(result.current.state.title).toBe("Second page");
    expect(result.current.editRevision).toEqual({
      source: "base",
      sha: "second-sha",
    });
  });

  it("does not turn a failed edit load into a deployable new page", async () => {
    const path = "apps/landing/src/content/licence.md";
    loadPageMock.mockRejectedValue(new Error("GitHub is unavailable"));

    const { result } = renderHook(() => useEditorState([], { path }, [], true));
    await act(async () => Promise.resolve());
    act(() => {
      result.current.set("title", "Replacement title");
      result.current.set("body", "Replacement body");
      result.current.set("slug", "licence");
      result.current.set("linkType", "none");
    });

    expect(result.current.sourceReady).toBe(false);
    expect(result.current.canDeploy).toBe(false);
    expect(result.current.deployBlockReason).toBe(
      "Load the page before deploying",
    );
  });

  it("preserves but blocks a draft based on an older PR revision", async () => {
    const path = "apps/landing/src/content/licence.md";
    const state = {
      formId: "",
      slug: "licence",
      title: "My draft title",
      description: "",
      category: "",
      subcategory: "",
      body: "My draft body",
      linkType: "none" as const,
      linkHref: "",
      visibility: "draft" as const,
    };
    writeDraft(draftKeyFor(path), {
      version: 2,
      state,
      revision: {
        source: "pr",
        sha: "page-1",
        prNumber: 42,
        branch: "start-page-licence-1",
        headSha: "head-1",
      },
    });
    loadPageMock.mockResolvedValue({
      path,
      sha: "page-2",
      frontmatter: { title: "Latest title", visibility: "draft" },
      body: "Latest body",
      revision: {
        source: "pr",
        sha: "page-2",
        prNumber: 42,
        branch: "start-page-licence-1",
        headSha: "head-2",
      },
    });

    const { result } = renderHook(() => useEditorState([], { path }, [], true));
    await act(async () => Promise.resolve());

    expect(result.current.state.title).toBe("My draft title");
    expect(result.current.staleDraft).toBe(true);
    expect(result.current.canDeploy).toBe(false);
    expect(result.current.deployBlockReason).toMatch(/older page revision/);
  });
});
