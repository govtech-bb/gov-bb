import type { Behaviour, CopyFromBehaviour } from "@govtech-bb/form-types";
import { evaluateCondition, flattenStepValues } from "./internals";
import type { StepScopedValues } from "./index";

/**
 * The minimum a field needs to expose for a mirror to be resolved. Typed
 * structurally rather than as `Primitive` so the forms client can pass its own
 * `ClientPrimitive` (the field mapper renames `elements` to `fields` and adds
 * render-only keys) without either side casting.
 */
export interface CopyFromField {
  fieldId: string;
  behaviours?: Behaviour[];
}

export interface CopyFromStep {
  stepId: string;
  elements: readonly CopyFromField[];
}

export interface CopyFromResult {
  /** A new value tree with every matching mirror applied. Input is not mutated. */
  values: StepScopedValues;
  /**
   * Which fields are currently mirrored, keyed by stepId — the instance-0
   * projection, matching the `hiddenFieldIds` convention in `ConditionResult`.
   * The renderer reads this to mark a field read-only: its value is about to be
   * recomputed from the source, so inviting an edit would be a lie.
   */
  mirrored: Map<string, Set<string>>;
}

function copyFromBehaviours(primitive: CopyFromField): CopyFromBehaviour[] {
  return (primitive.behaviours ?? []).filter(
    (b): b is CopyFromBehaviour => b.type === "copyFrom",
  );
}

/**
 * Read `sourceStepId.sourceFieldId` out of the value tree.
 *
 * A source inside a REPEATABLE step is refused (undefined): that step's values
 * are an array of instances, so "the" source value is ambiguous, and picking an
 * instance arbitrarily is exactly the kind of quiet wrong answer this behaviour
 * exists to prevent. The same stance as `readPath` in the webhook mapper.
 */
function readSource(
  values: StepScopedValues,
  behaviour: CopyFromBehaviour,
): unknown {
  const step = values[behaviour.sourceStepId];
  if (!step || Array.isArray(step)) return undefined;
  return step[behaviour.sourceFieldId];
}

/**
 * Apply every `copyFrom` mirror whose condition currently matches.
 *
 * This is a DERIVATION, deliberately recomputed from scratch on every call
 * rather than written once when the gate flips. That is the whole point: a
 * one-shot copy goes stale the moment the applicant edits the source, and a
 * stale premises address is a silently misrouted submission (the catchment
 * router reads the mirrored field). Recomputing means the mirror cannot
 * disagree with its source.
 *
 * When the gate matches, the source value is written EVEN IF it is empty. The
 * alternative — leaving the target's previous answer in place — is the stale
 * copy again, just harder to spot. An empty source surfaces as a required-field
 * error, which is loud; a stale one routes to the wrong polyclinic, which is not.
 *
 * Mirrors are evaluated against the INPUT values, so two mirrors cannot chain
 * within one call (a field mirrored from another mirrored field reads the
 * pre-copy value). Chaining is not a use case we have, and evaluating in
 * document order instead would make the result depend on element ordering.
 *
 * On a REPEATABLE target step, omit the behaviour's `targetStepId` when the gate
 * lives on that same step: `resolveTargetValue` only consults the current
 * instance when `targetStepId` is absent, so setting it explicitly would pin
 * every instance's decision to instance 0's answer. That is pre-existing
 * evaluator behaviour, shared with `fieldConditionalOn`.
 */
export function resolveCopyFrom(
  contract: { steps: readonly CopyFromStep[] },
  values: StepScopedValues,
): CopyFromResult {
  const flatValues = flattenStepValues(values);
  const mirrored = new Map<string, Set<string>>();
  let next: StepScopedValues | undefined;

  for (const step of contract.steps) {
    const withMirrors = step.elements.filter(
      (p) => copyFromBehaviours(p).length > 0,
    );
    if (withMirrors.length === 0) continue;

    const stepValues = values[step.stepId];
    const instances: Array<Record<string, unknown>> = Array.isArray(stepValues)
      ? stepValues
      : [(stepValues as Record<string, unknown>) ?? {}];

    const patchedInstances: Array<Record<string, unknown>> = [];
    const mirroredHere = new Set<string>();
    let touched = false;

    instances.forEach((instanceValues, index) => {
      let patched: Record<string, unknown> | undefined;

      for (const primitive of withMirrors) {
        for (const behaviour of copyFromBehaviours(primitive)) {
          const matches = evaluateCondition(
            behaviour,
            values,
            flatValues,
            instanceValues,
          );
          if (!matches) continue;
          patched ??= { ...instanceValues };
          patched[primitive.fieldId] = readSource(values, behaviour);
          touched = true;
          // Instance 0 is what the flat `mirrored` map projects, matching
          // `hiddenFieldIds`.
          if (index === 0) mirroredHere.add(primitive.fieldId);
          // First matching mirror on a field wins — later ones would fight it.
          break;
        }
      }

      patchedInstances.push(patched ?? instanceValues);
    });

    if (mirroredHere.size > 0) mirrored.set(step.stepId, mirroredHere);
    if (!touched) continue;

    next ??= { ...values };
    next[step.stepId] = Array.isArray(stepValues)
      ? patchedInstances
      : patchedInstances[0];
  }

  return { values: next ?? values, mirrored };
}
