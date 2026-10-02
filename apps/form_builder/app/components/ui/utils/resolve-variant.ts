export function resolveVariant<T extends Record<string, unknown>>(
  variants: T,
  key: string,
  fallback: keyof T,
): T[keyof T] {
  return Object.hasOwn(variants, key)
    ? variants[key as keyof T]
    : variants[fallback];
}
