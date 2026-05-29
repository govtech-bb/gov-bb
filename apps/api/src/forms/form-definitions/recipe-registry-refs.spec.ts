import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";

// Guards the #416 migration: recipe refs that point at the builtin registry
// (`components/generic-*` primitives and `components/show-hide`) MUST resolve
// against BUILTIN_REGISTRY, and the pre-migration slash refs they replaced
// (`components/generic/<type>`) must never reappear. Ref resolution is lazy
// (RegistryService.hydrateForm at request time), so an unresolvable registry
// ref is NOT caught at boot or by the CI build/test gate — only here. See #416.
//
// #426 removed the four remaining orphan slash refs (table, signature,
// repeater, display — info-box had no refs) by rewriting recipes with supported
// primitives + native repeatable behaviours. The third test below forbids those
// orphan refs from reappearing in the latest version of any recipe. Older,
// superseded version files are intentionally exempt: the highest semver wins
// when no version is requested (RecipeFileLoaderService.latestVersion), so only
// the latest version is served by default, and #426 was scoped to those.
const RECIPES_ROOT = path.resolve(__dirname, "recipes");

// The 11 slash refs migrated to the builtin registry by #416. Any of these
// reappearing means a recipe (or a newly generated form) regressed to the old
// DB-namespaced ref.
const MIGRATED_SLASH_REFS = [
  "components/generic/radio",
  "components/generic/number",
  "components/generic/checkbox",
  "components/generic/textarea",
  "components/generic/text",
  "components/generic/text-input",
  "components/generic/text-field",
  "components/generic/date",
  "components/generic/date-input",
  "components/generic/file-upload",
  "components/generic/show-hide",
];

// The four orphan slash refs #426 removed (plus info-box, which never had refs
// but must never be introduced). These had no definition in the repo and only
// resolved from manually-inserted custom_components rows.
const ORPHAN_SLASH_REFS = [
  "components/generic/table",
  "components/generic/signature",
  "components/generic/repeater",
  "components/generic/display",
  "components/generic/info-box",
];

// Compare two dotted version strings (e.g. "1.2.0"). Returns >0 if a > b, <0 if
// a < b, 0 if equal. Mirrors RecipeFileLoaderService.compareSemver so "latest"
// here means the same file the loader serves when no version is requested.
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function collectRefs(): Promise<{ ref: string; where: string }[]> {
  const out: { ref: string; where: string }[] = [];
  const formDirs = (await fs.readdir(RECIPES_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = await fs.readFile(path.join(dir, file), "utf8");
      for (const m of raw.matchAll(/"ref":\s*"([^"]+)"/g)) {
        out.push({ ref: m[1], where: `${formId}/${file}` });
      }
    }
  }
  return out;
}

// Refs collected only from the highest-semver file in each recipe directory —
// the version served by default.
async function collectLatestVersionRefs(): Promise<
  { ref: string; where: string }[]
> {
  const out: { ref: string; where: string }[] = [];
  const formDirs = (await fs.readdir(RECIPES_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    if (files.length === 0) continue;

    const latest = files.reduce((best, file) =>
      compareSemver(file.replace(/\.json$/, ""), best.replace(/\.json$/, "")) >
      0
        ? file
        : best,
    );

    const raw = await fs.readFile(path.join(dir, latest), "utf8");
    for (const m of raw.matchAll(/"ref":\s*"([^"]+)"/g)) {
      out.push({ ref: m[1], where: `${formId}/${latest}` });
    }
  }
  return out;
}

it("every components/generic-* and components/show-hide recipe ref resolves against BUILTIN_REGISTRY", async () => {
  const refs = await collectRefs();
  const registryNamespaced = refs.filter(
    ({ ref }) =>
      ref.startsWith("components/generic-") || ref === "components/show-hide",
  );

  const unresolved = registryNamespaced.filter(
    ({ ref }) => !(ref in BUILTIN_REGISTRY),
  );

  expect(unresolved.map((u) => `${u.where}: ${u.ref}`)).toEqual([]);
  // Sanity: the migration touched the bulk of recipes, so this set is large.
  expect(registryNamespaced.length).toBeGreaterThan(0);
});

it("no recipe references a migrated components/generic/* slash ref", async () => {
  const refs = await collectRefs();
  const stragglers = refs.filter(({ ref }) =>
    MIGRATED_SLASH_REFS.includes(ref),
  );

  expect(stragglers.map((s) => `${s.where}: ${s.ref}`)).toEqual([]);
});

it("no latest-version recipe references an orphan components/generic/* slash ref (#426)", async () => {
  const refs = await collectLatestVersionRefs();
  const orphans = refs.filter(({ ref }) => ORPHAN_SLASH_REFS.includes(ref));

  expect(orphans.map((o) => `${o.where}: ${o.ref}`)).toEqual([]);
});
