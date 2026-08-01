import { serviceContractSchema } from "@govtech-bb/form-types";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { BUILTIN_REGISTRY } from "@govtech-bb/registry";
import { hydrateForm, type Resolver } from "./resolution";

// Builtin-only resolver. Repo recipes are guarded (scripts/recipe-ref-guards.ts)
// to reference only BUILTIN_REGISTRY entries, so a custom (DB-backed) ref
// returns null and hydrateForm throws UnresolvableComponentError — a loud
// failure is correct here rather than a silently-wrong preview contract.
const builtinResolver: Resolver = async (ref) => BUILTIN_REGISTRY[ref] ?? null;

/**
 * Hydrate a raw recipe into the ServiceContract the API serves on the public
 * path, minus `processors` (which FormDefinitionsService.findByFormId strips
 * before the client sees them — never bundle endpoint/secretEnv/mapping config
 * into the public preview client). Throws on an unresolvable ref.
 *
 * Consumed by scripts/generate-preview-contracts.ts to emit the bundled
 * contracts the forms app serves under VITE_PREVIEW_CONTRACTS.
 */
export async function hydrateRecipeForPreview(
  recipe: ServiceContractRecipe,
): Promise<ServiceContract> {
  const hydrated = await hydrateForm(recipe, builtinResolver);
  const { processors: _processors, ...publicContract } = hydrated;
  return serviceContractSchema.parse(publicContract);
}
