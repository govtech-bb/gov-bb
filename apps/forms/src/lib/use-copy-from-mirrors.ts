import * as React from "react";
import { shallow } from "@tanstack/react-store";
// `useStore` from react-form, not react-store: the form's store is the
// react-form adapter's, and the react-store hook cannot read it (it throws
// "atom?.get is not a function"). Matches form-renderer.tsx.
import { useStore, type AnyFormApi } from "@tanstack/react-form";
import type { CopyFromBehaviour } from "@govtech-bb/form-types";
import {
  evaluateCondition,
  flattenStepValues,
} from "@govtech-bb/form-conditions";
import type { ClientFormStep, ClientPrimitive } from "@forms/types";
import { buildStepScopedValues } from "./form-builder/helpers/value-tree";

/**
 * Keep every `copyFrom` field in the form showing its source's value.
 *
 * Every visible step is walked, not just the current one: "Check your answers"
 * renders live form state, so a mirror left unrefreshed because the applicant
 * edited their address and then skipped past the step holding the mirror would
 * show them one address and submit another. FieldIds are unique across a form,
 * so the returned set is safe to apply to any step's fields.
 *
 * The authoritative copy happens server-bound, in `resolveCopyFrom` on the
 * submit path — this hook exists so the applicant SEES the mirrored value while
 * filling the form in, and so it reaches "Check your answers" (which renders
 * live form state, not the submission payload).
 *
 * It writes into form state rather than deriving at render because the value has
 * to be a real answer: catchment routing reads it, the MDA email prints it, and
 * validation runs against it. Staleness is handled by re-running on every source
 * change — the write is reactive, not a one-shot when the gate flipped — and by
 * `resolveCopyFrom` re-deriving at submit regardless of what the UI wrote. If
 * the two ever disagreed, the submit-path derivation is the one that ships.
 *
 * Returns the fieldIds currently mirrored, so the caller can render them
 * read-only: the value is recomputed from the source, so offering an edit would
 * be a lie.
 */
export function useCopyFromMirrors(
  form: AnyFormApi,
  steps: readonly ClientFormStep[],
): Set<string> {
  const mirrorFields = React.useMemo(
    () =>
      steps
        .flatMap((step) => step.fields)
        .map((field) => ({
          field,
          behaviours: (field.behaviours ?? []).filter(
            (b): b is CopyFromBehaviour => b.type === "copyFrom",
          ),
        }))
        .filter((entry) => entry.behaviours.length > 0),
    [steps],
  );

  // Recompute whenever any watched value changes. Subscribing to the whole
  // value bag with a shallow compare is what the show-hide toggles above do;
  // the alternative (subscribing per source path) would miss a source that is
  // itself conditionally rendered.
  const resolved = useStore(
    form.store,
    (state) => {
      const out: Record<string, unknown> = {};
      if (mirrorFields.length === 0) return out;

      const values = buildStepScopedValues(
        (state.values ?? {}) as Record<string, unknown>,
      );
      const flatValues = flattenStepValues(values);

      for (const { field, behaviours } of mirrorFields) {
        for (const behaviour of behaviours) {
          // Match the client's historical resolution (see checkConditionalOn):
          // a condition with no explicit target step resolves against the
          // field's own step.
          const condition = behaviour.targetStepId
            ? behaviour
            : { ...behaviour, targetStepId: field.stepId };
          if (!evaluateCondition(condition, values, flatValues)) continue;
          const source = values[behaviour.sourceStepId];
          out[field.id] = Array.isArray(source)
            ? undefined
            : source?.[behaviour.sourceFieldId];
          // First matching mirror wins, as in resolveCopyFrom.
          break;
        }
      }
      return out;
    },
    shallow,
  );

  // Write the mirrored values into form state. Guarded on inequality so this
  // does not loop: setFieldValue triggers a store update, which re-runs the
  // selector above, which yields the same object and stops here.
  React.useEffect(() => {
    for (const [fieldId, value] of Object.entries(resolved)) {
      const current = (form.state.values as Record<string, unknown>)[fieldId];
      if (current !== value) form.setFieldValue(fieldId, value as never);
    }
  }, [resolved, form]);

  return React.useMemo(
    () =>
      new Set(
        Object.keys(resolved).map(
          (id) =>
            mirrorFields.find((entry) => entry.field.id === id)?.field
              .fieldId ?? id,
        ),
      ),
    [resolved, mirrorFields],
  );
}

/**
 * Mark the mirrored fields read-only so the applicant is not invited to edit a
 * value that is about to be recomputed from its source.
 */
export function applyMirrorReadOnly(
  fields: ClientPrimitive[],
  mirrored: Set<string>,
): ClientPrimitive[] {
  if (mirrored.size === 0) return fields;
  return fields.map((field) =>
    mirrored.has(field.fieldId) ? { ...field, readOnly: true } : field,
  );
}
