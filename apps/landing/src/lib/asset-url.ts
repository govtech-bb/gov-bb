/**
 * A public asset's URL. The CMS preview runs on the CMS's own origin, so it
 * passes the landing origin as `assetBase`; the public site passes nothing and
 * keeps root-relative paths. `assetBase` must be an origin: `path` is
 * root-relative, so any path on the base is replaced, not prefixed.
 */
export function assetUrl(path: string, assetBase?: string): string {
  return assetBase ? new URL(path, assetBase).href : path
}
