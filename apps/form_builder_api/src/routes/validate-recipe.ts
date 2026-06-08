import {
  validateFormContract,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  collectUnknownRefs,
} from "@govtech-bb/form-builder";
import type { ValidationResult, ValidationIssue } from "@govtech-bb/form-types";
import { getFullCatalog } from "../catalog.js";

/**
 * The full author-time recipe validation, in three layers, run against the live
 * catalog (builtin + DB custom components):
 *
 *   1. `validateFormContract` — the `serviceContractRecipeSchema` parse
 *      (kebab-case id enforcement from #741, repeatable-bounds from #771).
 *   2. `findRecipeIdCollisionsFromRecipe` — recipe-wide fieldId/stepId
 *      uniqueness, which the Zod schema can't check without a catalog to
 *      resolve component defaults (ADR 0010).
 *   3. `collectUnknownRefs` — ref-existence: the schema validates ref *format*,
 *      so a ref to a removed/renamed component parses but would drop in preview
 *      / throw in the renderer (also ADR 0010).
 *
 * Shared by `POST /builder/registry/validate` (the client Deploy gate) and
 * `POST /builder/publish` (the server backstop) so the two can't drift. Returns
 * the same `{ ok: true, data } | { ok: false, issues }` shape /validate emits.
 */
export async function validateRecipeFully(
  recipe: unknown,
): Promise<ValidationResult> {
  const result = validateFormContract(recipe);
  if (!result.ok) {
    return result;
  }

  const catalog = await getFullCatalog();

  const collisions = findRecipeIdCollisionsFromRecipe(result.data, catalog);
  const collisionIssues = formatCollisionIssues(collisions);
  if (collisionIssues.length > 0) {
    return { ok: false, issues: collisionIssues };
  }

  const unknownRefIssues: ValidationIssue[] = collectUnknownRefs(
    result.data,
    catalog,
  ).map(({ ref, path }) => ({
    path,
    message: `Unknown component/block ref "${ref}"`,
  }));
  if (unknownRefIssues.length > 0) {
    return { ok: false, issues: unknownRefIssues };
  }

  return result;
}
