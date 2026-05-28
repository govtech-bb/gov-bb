/**
 * An offending ref discovered during hydration, paired with the recipe path
 * that pointed at it.
 */
export interface UnknownRef {
  ref: string;
  path: string;
}

/**
 * Thrown by `hydrateForm` when a recipe references one or more
 * component/block refs that don't exist in the registry catalog.
 *
 * Collects *all* unknown refs in a single pass (rather than failing on the
 * first) so callers can surface a complete report. The mirror of the API
 * resolver's `UnresolvableComponentError`, which the preview path previously
 * diverged from by silently dropping the field.
 */
export class UnknownRefError extends Error {
  constructor(public readonly unknownRefs: UnknownRef[]) {
    super(
      `Unknown component/block ref(s): ${unknownRefs
        .map((u) => `"${u.ref}"`)
        .join(", ")}`,
    );
    this.name = "UnknownRefError";
  }
}
