import { deserializeRecipe } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

/**
 * Pick the `?formId=` handoff param out of the UI builder route's raw search.
 * Anything that isn't a non-empty string is dropped so a stray or malformed
 * param can't trigger an auto-open.
 */
export function parseBuilderSearch(search: Record<string, unknown>): {
  formId?: string;
} {
  const { formId } = search;
  return typeof formId === "string" && formId.length > 0 ? { formId } : {};
}

/**
 * Turn a stored recipe into the args `handleLoad` needs. The version comes from
 * the recipe itself — a form opened straight from AI has no form summary to
 * read it from. `deserialize` is injectable for testing.
 */
export function buildLoadArgs(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
  deserialize: (
    r: ServiceContractRecipe,
    c: RegistryCatalog,
  ) => RecipeDraft = deserializeRecipe,
): { draft: RecipeDraft; version: string } {
  return { draft: deserialize(recipe, catalog), version: recipe.version };
}
