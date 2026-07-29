/**
 * Barbados-dollar currency formatting, shared by the landing calculators
 * (pension, severance, NIS coverage) so they format money identically.
 *
 * `money(n)` formats an amount as BBD with two fraction digits; a falsy or NaN
 * amount formats as `$0.00`.
 */
const moneyFmt = new Intl.NumberFormat('en-BB', {
  style: 'currency',
  currency: 'BBD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const money = (n: number) => moneyFmt.format(n || 0)
