const DEFAULT_ALLOWED_ORIGINS = ["ezpay.gov.bb"];

function getAllowedHosts(): string[] {
  // Vite statically replaces `import.meta.env.VITE_*` with the build-time
  // value when bundling the browser app, so this resolves to the configured
  // allowlist in production. Read lazily here so tests can drive it per-case
  // with `vi.stubEnv`.
  const raw = import.meta.env.VITE_PAYMENT_ALLOWED_ORIGINS;
  if (typeof raw !== "string" || raw.trim() === "") {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const a = allowed.replace(/\.$/, "");
  return h === a || h.endsWith(`.${a}`);
}

export function isSafePaymentUrl(u: string | undefined | null): u is string {
  if (typeof u !== "string" || u.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname) return false;
  return getAllowedHosts().some((h) => hostMatches(parsed.hostname, h));
}
