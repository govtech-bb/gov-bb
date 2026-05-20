/**
 * Validates that s is a valid SemVer string (X.Y.Z where all are non-negative integers, major >= 1)
 */
export function validate(s: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(s)) return false;
  const [major] = s.split(".");
  return parseInt(major, 10) >= 1;
}

/**
 * Compares two semver strings.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compare(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/**
 * Returns the next minor version: "1.2.3" → "1.3.0"
 */
export function bumpMinor(s: string): string {
  const [major, minor] = s.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}
