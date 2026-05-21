import { notFound } from "@tanstack/react-router";
import { isProdBuild } from "../../lib/env";

/**
 * Route guard for `/admin/form-builder`. Throws `notFound()` in production
 * builds so visitors see the global 404 page rather than the admin UI.
 * Lives in its own file (not in the route module) so the Jest spec can
 * import it without parsing the route file's top-level `import.meta` usage.
 */
export function adminFormBuilderBeforeLoad(): void {
  if (isProdBuild()) {
    throw notFound();
  }
}
