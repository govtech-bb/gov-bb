/** Native picker increments; authored absence keeps the respondent control's default. */
export function positiveIncrementError(value: unknown): string | null {
  if (value === undefined) return null;

  return typeof value !== "number" || !Number.isFinite(value) || value <= 0
    ? "Enter a number greater than 0"
    : null;
}

export const DEFAULT_TIME_INCREMENT = 1800;

export function timeIncrementError(value: unknown): string | null {
  return (
    positiveIncrementError(value) ??
    (value !== undefined && !Number.isInteger(value) ? "Enter a whole number of seconds" : null)
  );
}
