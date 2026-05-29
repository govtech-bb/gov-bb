import type {
  ServiceContract,
  ServiceContractRecipe,
  Primitive,
  FieldOverrides,
  ValidationRule,
} from "@govtech-bb/form-types";
import type { RegistryCatalog } from "./catalog";
import type { ComponentDefinition, BlockDefinition } from "./definition-types";
import { getRegistryItem } from "./catalog";
import { UnknownRefError, type UnknownRef } from "./errors";

/**
 * Deep-merge validation rules: both can have keys; override keys win.
 */
function mergeValidations(
  base: ValidationRule | undefined,
  override: ValidationRule | undefined,
): ValidationRule | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Merge FieldOverrides onto a Primitive (shallow merge, deep merge for validations).
 */
function applyOverrides(
  primitive: Primitive,
  overrides: FieldOverrides,
): Primitive {
  const { validations: baseValidations, ...restPrimitive } = primitive;
  const { validations: overrideValidations, ...restOverrides } = overrides;

  const mergedValidations = mergeValidations(
    baseValidations,
    overrideValidations,
  );
  return {
    ...restPrimitive,
    ...restOverrides,
    ...(mergedValidations !== undefined
      ? { validations: mergedValidations }
      : {}),
  } as Primitive;
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

  // Collect every unknown ref across the whole recipe in one pass so we can
  // report them all together, then throw (the API resolver throws too — this
  // keeps the preview path consistent instead of silently dropping fields).
  const unknownRefs: UnknownRef[] = [];

  const steps = recipe.steps.map((recipeStep) => {
    const elements: Primitive[] = [];

    recipeStep.elements.forEach((field, index) => {
      const item = getRegistryItem(field.ref, catalog);

      if (!item) {
        unknownRefs.push({
          ref: field.ref,
          path: `steps[${recipeStep.stepId}].elements[${index}].ref`,
        });
        return;
      }

      if (field.ref.startsWith("components/")) {
        const componentDef = item as ComponentDefinition;
        const overrides =
          (field as { ref: string; overrides?: FieldOverrides }).overrides ??
          {};
        elements.push(applyOverrides(componentDef.primitive, overrides));
      } else if (field.ref.startsWith("blocks/")) {
        const blockDef = item as BlockDefinition;
        const childOverrides =
          (field as { ref: string; overrides?: Record<string, FieldOverrides> })
            .overrides ?? {};

        for (const element of blockDef.block.elements) {
          const childOverride = childOverrides[element.fieldId] ?? {};
          elements.push(applyOverrides(element, childOverride));
        }
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

  if (unknownRefs.length > 0) {
    throw new UnknownRefError(unknownRefs);
  }

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
    createdAt: now,
    updatedAt: now,
  };
}
