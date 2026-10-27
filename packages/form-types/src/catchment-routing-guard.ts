import type { ServiceContractRecipe } from "./service-contract.type";

/**
 * A recipe that declares `catchmentRouting` must also carry a webhook processor
 * with `mapping.programmeCode`: the API composes the per-polyclinic CMS
 * programme code from it, so without one it refuses the recipe at boot and the
 * form is not served. Shared so the builder's Deploy gate and
 * `pnpm validate-recipes` enforce the API's rule before the recipe reaches it
 * (#2877). Returns human-readable error strings (empty when clean).
 */
export function checkCatchmentRoutingHasMapping(
  recipe: Pick<ServiceContractRecipe, "catchmentRouting" | "processors">,
): string[] {
  if (!recipe.catchmentRouting) return [];
  const mapped = (recipe.processors ?? []).some(
    (p) => p.type === "webhook" && Boolean(p.config.mapping?.programmeCode),
  );
  if (mapped) return [];
  return [
    "declares catchmentRouting but no webhook processor with mapping.programmeCode — the API refuses to load a catchment-routed form without one",
  ];
}
