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
// The 5 orphan slash refs that still resolve from the custom_components DB
// (table, signature, repeater, display, info-box) are intentionally allowed.
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
