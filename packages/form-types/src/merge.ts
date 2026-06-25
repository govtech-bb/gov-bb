/**
 * Shallow-merge an override object over a base, where either may be absent.
 * Override keys win; keys the override omits keep the base's value. Returns
 * undefined when both are absent. When only one side is present it is returned
 * by reference (not cloned) — safe because every caller spreads the result.
 */
export function shallowMergeDefined<T extends object>(
  base: T | undefined,
  override: T | undefined,
): T | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}
