// Default payment-URL allowlist, used when the host doesn't supply
// `allowedPaymentOrigins`. The package can't read Vite env (VITE_*), so the
// host is responsible for threading its own env-driven allowlist through that
// prop; this default only covers the production origin.
export const DEFAULT_ALLOWED_PAYMENT_ORIGINS = ["ezpay.gov.bb"];

function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const a = allowed.replace(/\.$/, "");
  return h === a || h.endsWith(`.${a}`);
}

// Guards against payment links that aren't a plain https URL on an allowed
// origin (e.g. javascript:/data:/blob: schemes, or an untrusted host).
export function isSafePaymentUrl(
  u: string | undefined | null,
  allowedOrigins: string[],
): u is string {
  if (typeof u !== "string" || u.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (!parsed.hostname) return false;
  return allowedOrigins.some((h) => hostMatches(parsed.hostname, h));
}
