/**
 * Whether this code is running in a Vite production build.
 *
 * Wraps `import.meta.env.PROD` so call sites are testable in Jest, which
 * does not natively understand Vite's compile-time env replacements.
 */
export function isProdBuild(): boolean {
  return import.meta.env.PROD;
}
