/**
 * Client-safe org utilities. Does NOT import mda.ts (which uses fs).
 * For use in client components like Header.
 */
export const ORG_PATH_PREFIX = '/government/organisations/'
export const orgHref = (slug: string): string => `${ORG_PATH_PREFIX}${slug}`

// hasMigratedSource is used by Header to conditionally hide the alpha banner.
// Since we can't access the full org data on the client without fs,
// we'll just always show the alpha banner (safe default).
// The server-rendered page will have the correct state.
export function hasMigratedSource(_slug: string): boolean {
  // In the client context, we can't check this without the fs-based data.
  // Default to false (show alpha banner). This is a safe fallback.
  return false
}
