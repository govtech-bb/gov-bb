import type {
  ServiceContract,
  ServiceContractRecipe,
  Primitive,
  FieldOverrides,
} from "@govtech-bb/form-types";
import { applyFieldOverrides } from "@govtech-bb/form-types";
import { requiredMessageDefect } from "@govtech-bb/form-validation";
import type { RequiredMessageDefect } from "@govtech-bb/form-validation";
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
 * The fields one recipe element resolves to: a component is itself, a block is
 * each of its children, in both cases with the element's overrides applied.
 */
function resolveElementFields(
  element: { ref: string; overrides?: unknown },
  item: ComponentDefinition | BlockDefinition,
): Primitive[] {
  if (element.ref.startsWith("blocks/")) {
    const childOverrides =
      (element.overrides as Record<string, FieldOverrides> | undefined) ?? {};
    return (item as BlockDefinition).block.elements.map((child) =>
      applyFieldOverrides(child, childOverrides[child.fieldId] ?? {}),
    );
  }
  return [
    applyFieldOverrides(
      (item as ComponentDefinition).primitive,
      (element.overrides as FieldOverrides | undefined) ?? {},
    ),
  ];
}

export interface GenericRequiredMessage {
  path: string;
  fieldId: string;
  defect: RequiredMessageDefect;
}

/**
 * Collect every effectively-required field in `recipe` that would show the
 * applicant a message naming no field, resolved against `catalog` the way the
 * serving path does.
 *
 * The effective message can come from either side of the merge: the generic
 * primitives ship the sentinel, so a recipe that overrides only `fieldId` and
 * `label` inherits it; and because `validations` merge per rule key, an
 * override that restates `required: { value: true }` over a component with a
 * good message replaces the whole rule and drops it (#2710). Both resolve here.
 *
 * The rule itself is `requiredMessageDefect` in @govtech-bb/form-validation —
 * shared with the `pnpm validate-recipes` guard so the trunk check and the
 * Deploy gate cannot disagree (#2227, #2714). Unresolved refs are skipped;
 * `collectUnknownRefs` owns those and runs first.
 */
export function collectGenericRequiredMessages(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
): GenericRequiredMessage[] {
  const found: GenericRequiredMessage[] = [];

  recipe.steps.forEach((recipeStep) => {
    recipeStep.elements.forEach((element, index) => {
      const item = getRegistryItem(element.ref, catalog);
      if (!item) return;

      const path = `steps[${recipeStep.stepId}].elements[${index}]`;
      for (const field of resolveElementFields(element, item)) {
        const defect = requiredMessageDefect(field);
        if (defect) found.push({ path, fieldId: field.fieldId, defect });
      }
    });
  });

  return found;
}

/**
 * Resolve a ServiceContractRecipe into a full ServiceContract by expanding
 * component and block refs using the provided catalog.
 */
export function hydrateForm(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
): ServiceContract {
  const now = new Date().toISOString();

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

      if (
        field.ref.startsWith("components/") ||
        field.ref.startsWith("blocks/")
      ) {
        elements.push(...resolveElementFields(field, item));
      }
    });

    return {
      stepId: recipeStep.stepId,
      title: recipeStep.title,
      ...(recipeStep.description !== undefined
        ? { description: recipeStep.description }
        : {}),
      elements,
      ...(recipeStep.behaviours !== undefined
        ? { behaviours: recipeStep.behaviours }
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
    ...(recipe.catchmentRouting !== undefined
      ? { catchmentRouting: recipe.catchmentRouting }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}
