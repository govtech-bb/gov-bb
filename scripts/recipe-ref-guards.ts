// Pure ref guards for recipe validation, folded in from the former
// apps/api/.../recipe-registry-refs.spec.ts. Kept free of any workspace imports
// so the always-run `validate-recipes` script AND its jest spec can both use
// them without the spec needing the registry's type declarations resolved.
//
// Ref resolution is lazy (RegistryService.hydrateForm at request time), so an
// unresolvable registry ref is NOT caught at boot or by the build/test gate.
// These guards, run by the always-run validate-recipes job, are now the single
// source of truth for the #416/#426 migration — they can't slip past
// nx-affected scoping the way the old spec did on #349 (the hole behind #504).

// The 11 slash refs #416 migrated to the builtin registry. Any reappearing
// means a recipe (or a newly generated form) regressed to the old DB-namespaced
// ref. (A bare slash *pattern* can't be banned — `components/<ns>/<type>` is a
// structurally valid custom ref — so the known-bad set is listed explicitly.)
export const MIGRATED_SLASH_REFS = [
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
export const ORPHAN_SLASH_REFS = [
  "components/generic/table",
  "components/generic/signature",
  "components/generic/repeater",
  "components/generic/display",
  "components/generic/info-box",
];

export interface RefLocation {
  ref: string;
  where: string;
}

// Compare two dotted version strings (e.g. "1.2.0"). Returns >0 if a > b, <0 if
// a < b, 0 if equal. Mirrors RecipeFileLoaderService.compareSemver so "latest"
// here means the same file the loader serves when no version is requested.
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Every `components/generic-*` / `components/show-hide` ref must resolve against
// the builtin registry. Returns one error string per unresolved ref.
export function checkRegistryRefsResolve(
  refs: RefLocation[],
  registry: Record<string, unknown>,
): string[] {
  return refs
    .filter(
      ({ ref }) =>
        ref.startsWith("components/generic-") || ref === "components/show-hide",
    )
    .filter(({ ref }) => !(ref in registry))
    .map(({ ref, where }) => `${where}: unresolved registry ref "${ref}"`);
}

// No recipe may reference a migrated slash ref, anywhere, at any version.
export function checkNoMigratedSlashRefs(refs: RefLocation[]): string[] {
  return refs
    .filter(({ ref }) => MIGRATED_SLASH_REFS.includes(ref))
    .map(({ ref, where }) => `${where}: migrated slash ref "${ref}"`);
}

// No latest-version recipe may reference an orphan slash ref. Older, superseded
// version files are intentionally exempt (the loader serves the highest semver).
export function checkNoOrphanRefsInLatest(latestRefs: RefLocation[]): string[] {
  return latestRefs
    .filter(({ ref }) => ORPHAN_SLASH_REFS.includes(ref))
    .map(({ ref, where }) => `${where}: orphan slash ref "${ref}"`);
}

// Pull every component/block ref out of a parsed recipe, tagged with `where`.
export function refsOf(
  recipe: { steps: { elements?: { ref: string }[] }[] },
  where: string,
): RefLocation[] {
  return recipe.steps.flatMap((step) =>
    (step.elements ?? []).map((el) => ({ ref: el.ref, where })),
  );
}
