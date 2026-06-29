export function elapsedSeconds(startMs: number | null): number {
  if (startMs === null) return 0;
  return Math.round((Date.now() - startMs) / 1000);
}
