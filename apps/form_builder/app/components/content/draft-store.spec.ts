/**
 * @vitest-environment jsdom
 */
import { EMPTY_PAGE } from "../../lib/content";
import {
  createPageDraft,
  newPageDrafts,
  draftKeyFor,
  readDraft,
  writeDraft,
  clearDraft,
} from "./draft-store";

beforeEach(() => localStorage.clear());

describe("content draft-store", () => {
  it("namespaces the key by init signature", () => {
    expect(draftKeyFor("services/foo.md")).toBe(
      "content-cms:draft:services/foo.md",
    );
    expect(draftKeyFor(":")).toBe("content-cms:draft::");
  });

  it("round-trips a draft", () => {
    const key = draftKeyFor("services/foo.md");
    const draft = { title: "Renew passport", body: "## Steps" };
    writeDraft(key, draft);
    expect(readDraft(key)).toEqual(draft);
  });

  it("returns null when nothing is stored", () => {
    expect(readDraft(draftKeyFor("nope"))).toBeNull();
  });

  it("returns null (not a throw) on corrupt JSON", () => {
    const key = draftKeyFor("bad");
    localStorage.setItem(key, "{not json");
    expect(readDraft(key)).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    const key = draftKeyFor("scalar");
    localStorage.setItem(key, "42");
    expect(readDraft(key)).toBeNull();
  });

  it("clears a stored draft", () => {
    const key = draftKeyFor("services/foo.md");
    writeDraft(key, { title: "x" });
    clearDraft(key);
    expect(readDraft(key)).toBeNull();
  });
});

it("lists new page drafts and refuses to overwrite a draft or its URL alias", () => {
  const path = "apps/landing/src/content/alpha/help.md";
  const state = {
    ...EMPTY_PAGE,
    title: "Help",
    slug: "alpha/help",
    formId: "alpha",
  };
  createPageDraft(path, state);
  expect(newPageDrafts()).toEqual([
    expect.objectContaining({
      path,
      title: "Help",
      formId: "alpha",
      isLocalDraft: true,
    }),
  ]);
  expect(() =>
    createPageDraft(path, { ...state, title: "Replacement" }),
  ).toThrow(/already uses/);
  expect(() =>
    createPageDraft("apps/landing/src/content/alpha/help/index.md", state),
  ).toThrow(/already uses/);
  expect(readDraft(draftKeyFor(path))).toMatchObject({ state });
});

it("reports storage failure instead of claiming the new page was saved", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage full");
  });
  try {
    expect(() =>
      createPageDraft("apps/landing/src/content/alpha/help.md", EMPTY_PAGE),
    ).toThrow(/could not be saved/);
  } finally {
    spy.mockRestore();
  }
});
