import {
  validateFormContract,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  collectUnknownRefs,
  collectGenericRequiredMessages,
} from "@govtech-bb/form-builder";
import type { ValidationResult, ValidationIssue } from "@govtech-bb/form-types";
import { getFullCatalog } from "../catalog.js";

/**
 * The full author-time recipe validation, in four layers, run against the live
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
 *   4. `collectGenericRequiredMessages` — every effectively-required field must
 *      fail with a message that names it, since the forms error summary uses
 *      the message as its link text (#2227). Catalog-aware for the same reason
 *      as layer 2: the effective message comes from the registry base merged
 *      with the override, and either side can be the one that names nothing.
 *      `pnpm validate-recipes` runs the same rule over the committed recipes;
 *      this is the half that catches a recipe before it is deployed from the
 *      builder, including one built on a DB custom component (#2714).
 *
 * Used by `POST /builder/registry/validate` (the client Deploy gate). It was
 * also the server backstop for `POST /builder/publish` until that dormant route
 * was removed; it stays factored out so a future server-side gate cannot drift
 * from the client one. Returns the same
 * `{ ok: true, data } | { ok: false, issues }` shape /validate emits.
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

  const genericRequiredIssues: ValidationIssue[] =
    collectGenericRequiredMessages(result.data, catalog).map(
      ({ path, fieldId, defect }) => ({
        path,
        // The sentinel itself is never quoted here — @govtech-bb/form-validation
        // owns that string, and a copy would drift the day it changes.
        message:
          defect === "generic"
            ? `"${fieldId}" is required, but its error message is the generic default and names no field. Write one that names it, e.g. "Employer name is required".`
            : `"${fieldId}" is required but has no error message, so it falls back to a generic default that names no field. Write one that names it, e.g. "Employer name is required".`,
      }),
    );
  if (genericRequiredIssues.length > 0) {
    return { ok: false, issues: genericRequiredIssues };
  }

  return result;
}
