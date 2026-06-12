// Documents are ingested with canonical production URLs (https://alpha.gov.bb/…)
// so payload hashes stay identical across environments. The HOST is an
// environment concern, fixed at retrieval time instead of ingest time (#1268):
// the chat server's LANDING_URL is always the right origin for the viewer, it
// needs no infra plumbing into the ingest task, and it corrects rows that are
// already in the store without a re-ingest. Production's LANDING_URL is the
// canonical origin, so the rewrite is the identity there.
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
