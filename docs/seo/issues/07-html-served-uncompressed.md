# HTML and sitemap responses are served uncompressed

## Problem

Responses from the SSR compute carry no `content-encoding` even when the
request sends `Accept-Encoding: gzip, br`: the homepage HTML is 27,622 bytes
on the wire, `/sitemap.xml` 32,936 bytes. Static assets from the same host are
brotli-compressed with a one-year `s-maxage`. Lighthouse reports "document
latency — 18 KiB savings" on every page.

## Impact

Roughly 20 KB per page view before any content renders, on a 73 % mobile
audience; ~26 KB per sitemap fetch for crawlers.

## Where

- Amplify Hosting compute (Nitro `aws_amplify` preset,
  `apps/landing/vite.config.ts`); no compression middleware in the app.
- No `Cache-Control` on HTML is intentional (preview cookie makes HTML
  per-viewer) and should stay.

## Fix

1. Check the Amplify Console for a compression setting on the compute
   responses (Amplify compresses static assets; confirm whether it applies
   "Compress objects automatically" to compute behaviours).
2. If not available there, compress in the app: a Nitro plugin or h3 response
   hook that gzips/brotlis `text/html`, `application/xml`, `text/plain` when
   `Accept-Encoding` allows, adding `Vary: Accept-Encoding`. Keep it out of
   the static path (already compressed).
3. Measure before/after with `curl -sI -H 'Accept-Encoding: br, gzip'` and a
   Lighthouse re-run.

## Acceptance criteria

- `curl -s -o /dev/null -w '%header{content-encoding} %{size_download}' -H
'Accept-Encoding: br, gzip' https://alpha.gov.bb/` shows `br` or `gzip` and
  under 9,000 bytes.
- `/sitemap.xml` and `/robots.txt` compressed the same way.
- Lighthouse "document latency" insight no longer flags compression.

Suggested labels: `enhancement`, `severity:minor`, `area:infra`, `subsystem:landing`
