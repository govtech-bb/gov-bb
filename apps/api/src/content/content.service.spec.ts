import { filterVisible } from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";

const entries: ServiceIndexEntry[] = [
  { slug: "a", title: "A", visibility: "public" },
  { slug: "b", title: "B", visibility: "preview" },
  { slug: "c", title: "C", visibility: "draft" },
];

describe("filterVisible", () => {
  it("returns only public entries when includeNonPublic is false", () => {
    expect(filterVisible(entries, false)).toEqual([
      { slug: "a", title: "A", visibility: "public" },
    ]);
  });

  it("returns every entry when includeNonPublic is true", () => {
    expect(filterVisible(entries, true)).toEqual(entries);
  });
});
