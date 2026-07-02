export function currency(amount: unknown, code: unknown): string {
  // Treat empty/whitespace-only codes the same as missing — a blank form field
  // stores "", which `??` doesn't catch, and "" makes Intl.NumberFormat throw
  // RangeError, crashing config resolution instead of degrading to BBD (#1826).
  const c = String(code ?? "").trim() || "BBD";
  return new Intl.NumberFormat("en-BB", {
    style: "currency",
    currency: c,
  }).format(Number(amount));
}
