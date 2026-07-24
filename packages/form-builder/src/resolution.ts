import type {
  ServiceContract,
  ServiceContractRecipe,
  Primitive,
  FieldOverrides,
} from "@govtech-bb/form-types";
import { applyFieldOverrides } from "@govtech-bb/form-types";
import type { RegistryCatalog } from "./catalog";
import type { ComponentDefinition, BlockDefinition } from "./definition-types";
import { getRegistryItem } from "./catalog";
import { UnknownRefError, type UnknownRef } from "./errors";

/**
 * Collect every component/block ref in `recipe` that does not resolve against
 * `catalog`, paired with the recipe path that pointed at it. One pass, all
 * misses — callers can report them together rather than failing on the first.
 *
 * This is the single definition of "does this ref resolve against this
 * catalog?" — reused by `hydrateForm` (preview), the API `validateHandler`,
 * the AI convert path, and publish enforcement, so every entry point agrees.
 */
export function collectUnknownRefs(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
): UnknownRef[] {
  const unknownRefs: UnknownRef[] = [];
  recipe.steps.forEach((recipeStep) => {
    recipeStep.elements.forEach((field, index) => {
      if (!getRegistryItem(field.ref, catalog)) {
        unknownRefs.push({
          ref: field.ref,
          path: `steps[${recipeStep.stepId}].elements[${index}].ref`,
        });
      }
    });
  });
  return unknownRefs;
}

/**
 * Resolve a ServiceContractRecipe into a full ServiceContract by expanding
 * component and block refs using the provided catalog.
 */
export function hydrateForm(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
): ServiceContract {
  // Reject up front if any ref is unresolvable — collect them all together,
  // then throw (the API resolver throws too — this keeps the preview path
  // consistent instead of silently dropping fields).
  const unknownRefs = collectUnknownRefs(recipe, catalog);
  if (unknownRefs.length > 0) {
    throw new UnknownRefError(unknownRefs);
  }

  const steps = recipe.steps.map((recipeStep) => {
    const elements: Primitive[] = [];

    recipeStep.elements.forEach((field) => {
      // Guaranteed present: collectUnknownRefs above already rejected misses.
      const item = getRegistryItem(field.ref, catalog)!;

      if (field.ref.startsWith("components/")) {
        const componentDef = item as ComponentDefinition;
        const overrides =
          (field as { ref: string; overrides?: FieldOverrides }).overrides ??
          {};
        elements.push(applyFieldOverrides(componentDef.primitive, overrides));
      } else if (field.ref.startsWith("blocks/")) {
        const blockDef = item as BlockDefinition;
        const childOverrides =
          (field as { ref: string; overrides?: Record<string, FieldOverrides> })
            .overrides ?? {};

        for (const element of blockDef.block.elements) {
          const childOverride = childOverrides[element.fieldId] ?? {};
          elements.push(applyFieldOverrides(element, childOverride));
        }
      }
    });

    return {
      stepId: recipeStep.stepId,
      title: recipeStep.title,
      // Per-answer title overrides (#871). The live serving path reads
      // `conditionalTitle` off the resolved step (resolveStepTitle in
      // form-conditions), so it must survive hydration or the heading never
      // adapts.
      ...(recipeStep.conditionalTitle !== undefined
        ? { conditionalTitle: recipeStep.conditionalTitle }
        : {}),
      ...(recipeStep.description !== undefined
        ? { description: recipeStep.description }
        : {}),
      elements,
      ...(recipeStep.behaviours !== undefined
        ? { behaviours: recipeStep.behaviours }
        : {}),
      // Recipe-authored markdown (e.g. a confirmation "What you need to know"
      // section) carried through to the citizen-facing form. Note: `nextSteps`
      // is intentionally NOT carried — it is unused by the live serving path.
      ...(recipeStep.markdownContent !== undefined
        ? { markdownContent: recipeStep.markdownContent }
        : {}),
    };
  });

  return {
    formId: recipe.formId,
    title: recipe.title,
    ...(recipe.description !== undefined
      ? { description: recipe.description }
      : {}),
    // Carry service contact details through to the citizen-facing form (#452).
    ...(recipe.contactDetails !== undefined
      ? { contactDetails: recipe.contactDetails }
      : {}),
    version: recipe.version,
    steps,
    ...(recipe.processors !== undefined
      ? { processors: recipe.processors }
      : {}),
    // Preserve the recipe's own timestamps rather than regenerating them, so a
    // client-side hydrated preview matches exactly what the API serves.
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    // Lift the optional application deadline (#1936) onto the served contract.
    ...(recipe.meta?.closingDateTime !== undefined
      ? { closingDateTime: recipe.meta.closingDateTime }
      : {}),
  };
}
