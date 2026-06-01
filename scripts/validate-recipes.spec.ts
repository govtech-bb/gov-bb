import {
  compareSemver,
  checkRegistryRefsResolve,
  checkNoMigratedSlashRefs,
  checkNoOrphanRefsInLatest,
  refsOf,
  MIGRATED_SLASH_REFS,
  ORPHAN_SLASH_REFS,
  type RefLocation,
} from "./recipe-ref-guards";

describe("compareSemver", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareSemver("1.2.0", "1.1.0")).toBeGreaterThan(0);
    expect(compareSemver("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
  });
});

describe("refsOf", () => {
  it("flattens every element ref across steps, tagged with where", () => {
    const recipe = {
      steps: [
        {
          elements: [
            { ref: "components/generic-text" },
            { ref: "blocks/name" },
          ],
        },
        { elements: [{ ref: "components/show-hide" }] },
      ],
    };
    expect(refsOf(recipe, "f/1.0.0.json")).toEqual([
      { ref: "components/generic-text", where: "f/1.0.0.json" },
      { ref: "blocks/name", where: "f/1.0.0.json" },
      { ref: "components/show-hide", where: "f/1.0.0.json" },
    ]);
  });

  it("tolerates a step with no elements", () => {
    expect(refsOf({ steps: [{}] }, "f/1.0.0.json")).toEqual([]);
  });
});

describe("checkRegistryRefsResolve", () => {
  const registry = {
    "components/generic-text": {},
    "components/show-hide": {},
  };

  it("passes when every registry-namespaced ref resolves", () => {
    const refs: RefLocation[] = [
      { ref: "components/generic-text", where: "a/1.0.0.json" },
      { ref: "components/show-hide", where: "a/1.0.0.json" },
      // Custom refs (slash, non-generic) are not registry refs — ignored here.
      { ref: "components/gov/nis-number", where: "a/1.0.0.json" },
    ];
    expect(checkRegistryRefsResolve(refs, registry)).toEqual([]);
  });

  it("flags a components/generic-* ref absent from the registry", () => {
    const refs: RefLocation[] = [
      { ref: "components/generic-nope", where: "b/2.0.0.json" },
    ];
    expect(checkRegistryRefsResolve(refs, registry)).toEqual([
      'b/2.0.0.json: unresolved registry ref "components/generic-nope"',
    ]);
  });
});

describe("checkNoMigratedSlashRefs", () => {
  it("flags every migrated slash ref, anywhere", () => {
    const refs: RefLocation[] = [
      { ref: "components/generic/text", where: "x/1.1.0.json" },
      { ref: "components/generic-text", where: "x/1.1.0.json" }, // namespaced — fine
      { ref: "components/generic/show-hide", where: "x/1.0.0.json" },
    ];
    expect(checkNoMigratedSlashRefs(refs)).toEqual([
      'x/1.1.0.json: migrated slash ref "components/generic/text"',
      'x/1.0.0.json: migrated slash ref "components/generic/show-hide"',
    ]);
  });

  it("returns [] when no migrated slash refs are present", () => {
    expect(
      checkNoMigratedSlashRefs([
        { ref: "components/generic-text", where: "x/1.0.0.json" },
      ]),
    ).toEqual([]);
  });

  it("covers the regression behind #504 (non-nationals slash refs)", () => {
    const refs: RefLocation[] = [
      "components/generic/text",
      "components/generic/radio",
      "components/generic/file-upload",
      "components/generic/show-hide",
    ].map((ref) => ({
      ref,
      where: "non-nationals-secondary-entry/1.1.0.json",
    }));
    expect(checkNoMigratedSlashRefs(refs)).toHaveLength(4);
  });
});

describe("checkNoOrphanRefsInLatest", () => {
  it("flags orphan slash refs in the latest-version set", () => {
    const latestRefs: RefLocation[] = [
      { ref: "components/generic/table", where: "y/2.0.0.json" },
      { ref: "components/generic-text", where: "y/2.0.0.json" },
    ];
    expect(checkNoOrphanRefsInLatest(latestRefs)).toEqual([
      'y/2.0.0.json: orphan slash ref "components/generic/table"',
    ]);
  });

  it("returns [] when the latest set has no orphan refs", () => {
    expect(
      checkNoOrphanRefsInLatest([
        { ref: "components/generic-text", where: "y/2.0.0.json" },
      ]),
    ).toEqual([]);
  });
});

describe("ban-list integrity", () => {
  it("keeps the migrated and orphan ref sets disjoint", () => {
    const overlap = MIGRATED_SLASH_REFS.filter((r) =>
      ORPHAN_SLASH_REFS.includes(r),
    );
    expect(overlap).toEqual([]);
  });
});
