export function currency(amount: unknown, code: unknown): string {
  // Treat empty/whitespace-only codes the same as missing — a blank form field
  // stores "", which `??` doesn't catch, and "" makes Intl.NumberFormat throw
  // RangeError, crashing config resolution instead of degrading to BBD (#1826).
  const c = String(code ?? "").trim() || "BBD";
  const amt = Number(amount);
  try {
    return new Intl.NumberFormat("en-BB", {
      style: "currency",
      currency: c,
    }).format(amt);
  } catch {
    // A malformed non-empty code (e.g. "US", "12", "$5") is still rejected by
    // Intl.NumberFormat — fall back to BBD rather than crash resolution (#1826).
    return new Intl.NumberFormat("en-BB", {
      style: "currency",
      currency: "BBD",
    }).format(amt);
  }
}
