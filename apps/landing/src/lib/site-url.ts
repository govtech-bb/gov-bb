/**
 * Public origin of the live site, used to build absolute URLs for SEO:
 * canonical links, Open Graph `og:url`/`og:image`, and the sitemap.
 *
 * `VITE_`-prefixed so Vite inlines it at build time from the build-container env
 * (`import.meta.env`) — the value is public (it ships in the rendered <head>),
 * so it must NOT go through the server-only runtime config the way PREVIEW_SECRET
 * does. Each environment's build sets its own value; the default suits prod.
 * The trailing slash is stripped so `${SITE_URL}/path` never doubles up.
 */
export const SITE_URL = (
  (import.meta.env.VITE_SITE_URL as string | undefined) ??
  'https://alpha.gov.bb'
).replace(/\/$/, '')
