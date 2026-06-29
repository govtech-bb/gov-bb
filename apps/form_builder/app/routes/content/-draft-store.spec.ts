/**
 * @vitest-environment jsdom
 */
import { draftKeyFor, readDraft, writeDraft, clearDraft } from "./-draft-store";

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
