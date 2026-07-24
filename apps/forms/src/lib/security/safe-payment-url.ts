const DEFAULT_ALLOWED_ORIGINS = ["ezpay.gov.bb"];

// The safety check itself (https-only, hostname-suffix match) now lives in
// @govtech-bb/form-renderer's SubmissionConfirmation, which can't read Vite
// env. This app-side helper only resolves the env-driven allowlist, threaded
// in via the `allowedPaymentOrigins` prop.
export function getAllowedPaymentOrigins(): string[] {
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
