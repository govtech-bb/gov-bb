import type { Primitive, FieldOverrides } from './types/primitive.type';
import type { Block } from './types/block.type';
import type { FormStep, RecipeFormStep, RecipeFormStepField } from './types/form-step.type';
import type { ServiceContract, ServiceContractRecipe } from './types/service-contract.type';
import type { RegistryEntry } from './builtins';

export type Resolver = (ref: string) => Promise<RegistryEntry | null>;

export class UnresolvableComponentError extends Error {
  constructor(public readonly ref: string) {
    super(`Unknown component ref: ${ref}`);
    this.name = 'UnresolvableComponentError';
  }
}

function isBlock(entry: RegistryEntry): entry is Block {
  return 'blockId' in entry;
}

function applyPrimitiveOverrides(
  primitive: Primitive,
  overrides: FieldOverrides,
): Primitive {
  return { ...primitive, ...overrides };
}

function applyBlockOverrides(
  block: Block,
  overrides: Record<string, FieldOverrides>,
): Block {
  return {
    ...block,
    elements: block.elements.map((el) => {
      const fieldOverride = overrides[el.fieldId];
      if (!fieldOverride) return el;
      return { ...el, ...fieldOverride };
    }),
  };
}

export function mergeEntry(
  entry: RegistryEntry,
  field: RecipeFormStepField,
): RegistryEntry {
  const cloned = structuredClone(entry);

  if (!field.overrides) return cloned;

  if (isBlock(cloned)) {
    return applyBlockOverrides(cloned, field.overrides as Record<string, FieldOverrides>);
  }

  return applyPrimitiveOverrides(cloned as Primitive, field.overrides as FieldOverrides);
}

export async function hydrateStep(
  step: RecipeFormStep,
  resolver: Resolver,
): Promise<FormStep> {
  const elements = await Promise.all(
    step.elements.map(async (field) => {
      const entry = await resolver(field.ref);
      if (!entry) throw new UnresolvableComponentError(field.ref);
      return mergeEntry(entry, field);
    }),
  );

  return {
    stepId: step.stepId,
    title: step.title,
    description: step.description,
    behaviours: step.behaviours,
    elements,
  };
}

export async function hydrateForm(
  recipe: ServiceContractRecipe,
  resolver: Resolver,
): Promise<ServiceContract> {
  const steps = await Promise.all(
    recipe.steps.map((step) => hydrateStep(step, resolver)),
  );

  return {
    formId: recipe.formId,
    title: recipe.title,
    description: recipe.description,
    steps,
    processors: recipe.processors,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    version: recipe.version,
  };
}
