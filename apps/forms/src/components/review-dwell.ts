export function reviewDwellSeconds(enteredAt: number | null): number {
  if (enteredAt === null) return 0;
  return Math.round((Date.now() - enteredAt) / 1000);
}
