/**
 * robots.txt body. When indexing is disabled (preview/sandbox builds) the whole
 * site is disallowed; when enabled (production) everything is crawlable and the
 * sitemap is advertised. Gated by `VITE_ALLOW_INDEXING` at the call site.
 */
export function buildRobotsTxt(
  allowIndexing: boolean,
  siteUrl: string,
): string {
  if (!allowIndexing) {
    return 'User-agent: *\nDisallow: /\n'
  }
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`
}
