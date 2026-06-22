/**
 * Canonical recipe-version utilities — the single source for comparing,
 * validating, and bumping the `X.Y.Z` semantic versions the forms platform
 * emits. Previously copied across apps/api (recipe-file-loader) and
 * form_builder (github-recipes + lib/version) with subtly different edge-case
 * semantics, so the prod serving path and the builder publish path could pick a
 * *different* "latest" recipe for an odd version string. The one deliberate
 * exception is the DB-side `ORDER BY` in form_builder_api/form-uniqueness.ts,
 * commented there as such.
 */
import { SEMVER_PATTERN } from "./version-pattern";

/**
 * Parse a semver string ("1.10.2") into a tuple of integers. Non-numeric
 * segments fall back to -Infinity so they sort below every valid version.
 */
function parseVersion(v: string): number[] {
  return v.split(".").map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isFinite(n) ? n : -Infinity;
  });
}

/** Returns positive if a > b, negative if a < b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const aa = parseVersion(a);
  const bb = parseVersion(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Validates that `s` is a well-formed recipe version: `X.Y.Z` non-negative
 * integers with a major >= 1 (the platform's first published version is 1.0.0).
 */
export function validate(s: string): boolean {
  if (!SEMVER_PATTERN.test(s)) return false;
  const [major] = s.split(".");
  return Number.parseInt(major, 10) >= 1;
}

/** Returns the next minor version: "1.2.3" → "1.3.0". */
export function bumpMinor(s: string): string {
  const [major, minor] = s.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}

/** Returns the next patch version: "1.2.3" → "1.2.4". */
export function bumpPatch(s: string): string {
  const [major, minor, patch] = s.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}
