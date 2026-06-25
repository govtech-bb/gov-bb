import type { Primitive, FieldOverrides } from "@govtech-bb/form-types";
import { applyFieldOverrides } from "@govtech-bb/form-types";
import type { Block } from "@govtech-bb/form-types";
import type {
  FormStep,
  RecipeFormStep,
  RecipeFormStepField,
} from "@govtech-bb/form-types";
import type {
  ServiceContract,
  ServiceContractRecipe,
} from "@govtech-bb/form-types";
import type { RegistryEntry } from "@govtech-bb/registry";

export type Resolver = (ref: string) => Promise<RegistryEntry | null>;

export class UnresolvableComponentError extends Error {
  constructor(public readonly ref: string) {
    super(`Unknown component ref: ${ref}`);
    this.name = "UnresolvableComponentError";
  }
}

function isBlock(entry: RegistryEntry): entry is Block {
  return "blockId" in entry;
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
      return applyFieldOverrides(el, fieldOverride);
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
    return applyBlockOverrides(
      cloned,
      field.overrides as Record<string, FieldOverrides>,
    );
  }

  return applyFieldOverrides(
    cloned as Primitive,
    field.overrides as FieldOverrides,
  );
}

export async function hydrateStep(
  step: RecipeFormStep,
  resolver: Resolver,
): Promise<FormStep> {
  const resolved = await Promise.all(
    step.elements.map(async (field) => {
      const entry = await resolver(field.ref);
      if (!entry) throw new UnresolvableComponentError(field.ref);
      return mergeEntry(entry, field);
    }),
  );

  const elements: Primitive[] = resolved.flatMap((entry) =>
    isBlock(entry) ? entry.elements : [entry as Primitive],
  );

  return {
    stepId: step.stepId,
    title: step.title,
    // Per-answer title overrides (#871). The live serving path reads
    // `conditionalTitle` off the resolved step (resolveStepTitle in
    // form-conditions), so it must survive hydration — without this the
    // citizen-facing contract loses it and the heading never adapts.
    conditionalTitle: step.conditionalTitle,
    description: step.description,
    behaviours: step.behaviours,
    elements,
    // Carry recipe-authored markdown (e.g. a confirmation "What you need to
    // know" section) through to the citizen-facing form. Note: `nextSteps` is
    // intentionally NOT carried here — it is unused by the live serving path,
    // and wiring it would switch on dormant copy across many existing recipes.
    markdownContent: step.markdownContent,
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
    // Carry service contact details through to the citizen-facing form (#452).
    // Without this the seeded/authored details never reach citizens.
    contactDetails: recipe.contactDetails,
    steps,
    processors: recipe.processors,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    version: recipe.version,
  };
}
