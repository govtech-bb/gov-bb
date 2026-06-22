import type { Primitive, FieldOverrides } from "./primitive.type";
import { shallowMergeDefined } from "./merge";

/**
 * Merge `FieldOverrides` onto a `Primitive`: top-level keys are shallow-spread
 * (override wins), but `validations` and `ui` are deep-merged so an override
 * that restates one key does not drop the primitive's other shipped keys.
 *
 * This is the SINGLE source of recipe override-merge semantics. It is called by
 * both the production serving path (apps/api/src/registry/resolution.ts) and
 * the builder preview path (packages/form-builder/src/resolution.ts) so the
 * preview can never diverge from what citizens are served — a wholesale spread
 * here previously regressed `validations` (#371) and `ui` (#789), and the fix
 * had to be applied to two separate copies of this body.
 */
export function applyFieldOverrides(
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

  const mergedValidations = shallowMergeDefined(
    baseValidations,
    overrideValidations,
  );
  const mergedUi = shallowMergeDefined(baseUi, overrideUi);
  return {
    ...restPrimitive,
    ...restOverrides,
    ...(mergedValidations !== undefined
      ? { validations: mergedValidations }
      : {}),
    ...(mergedUi !== undefined ? { ui: mergedUi } : {}),
  } as Primitive;
}
