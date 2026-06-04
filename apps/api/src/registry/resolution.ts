import type {
  Primitive,
  FieldOverrides,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
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

/**
 * Deep-merge validation rules: both can have keys; override keys win.
 *
 * A shallow spread of `overrides` over the primitive would replace the whole
 * `validations` object, silently dropping any rule the primitive ships but the
 * recipe didn't restate (e.g. a recipe overriding only `required`'s message
 * would lose the primitive's `email`/`pattern` format rule). See issue #371.
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
 * Deep-merge ui hints: override keys win, absent keys keep the primitive's
 * shipped value. Same bug class as #371 but for `ui` — a wholesale replace
 * would drop hints the recipe didn't restate (e.g. overriding only `hideLabel`
 * on NationalIdNumber would lose its `width: "short"`). Mirrors `mergeUi` in
 * packages/form-builder/src/resolution.ts so the builder preview and the
 * served form agree. See issue #789.
 */
function mergeUi(
  base: PrimitiveUI | undefined,
  override: PrimitiveUI | undefined,
): PrimitiveUI | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

function applyPrimitiveOverrides(
  primitive: Primitive,
  overrides: FieldOverrides,
): Primitive {
  const {
    validations: baseValidations,
    ui: baseUi,
    ...restPrimitive
  } = primitive;
  const {
    validations: overrideValidations,
    ui: overrideUi,
    ...restOverrides
  } = overrides;

  const mergedValidations = mergeValidations(
    baseValidations,
    overrideValidations,
  );
  const mergedUi = mergeUi(baseUi, overrideUi);
  return {
    ...restPrimitive,
    ...restOverrides,
    ...(mergedValidations !== undefined
      ? { validations: mergedValidations }
      : {}),
    ...(mergedUi !== undefined ? { ui: mergedUi } : {}),
  } as Primitive;
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
      return applyPrimitiveOverrides(el, fieldOverride);
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

  return applyPrimitiveOverrides(
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
