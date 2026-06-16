// Documents are ingested with canonical production URLs (https://alpha.gov.bb/…)
// so payload hashes stay stable across environments. The HOST is fixed at
// retrieval time, not ingest time: the chat server's LANDING_URL is the right
// origin for the viewer, needs no ingest plumbing, and corrects already-stored
// rows without a re-ingest. In production LANDING_URL is the canonical origin,
// so the rewrite is the identity.
const LANDING_HOSTS = new Set(["alpha.gov.bb", "www.alpha.gov.bb"]);

export function rewriteLandingHost(url: string, landingOrigin: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!LANDING_HOSTS.has(parsed.hostname)) return url;
  return `${landingOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}
