export function currency(amount: unknown, code: unknown): string {
  return new Intl.NumberFormat("en-BB", {
    style: "currency",
    currency: String(code ?? "BBD"),
  }).format(Number(amount));
}
