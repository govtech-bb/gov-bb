// Leaf types for repeatable-step configuration. Kept free of any back-edge to
// behavior-helper.type / renderer.type so both can import these without forming
// an import cycle (#1407).

import { FormValues } from "./field-mapper.type";

type sourceStepId = string;
type stepId = string;

export interface RepeatableConfig {
  minRepeats: number;
  maxRepeats: number;
  // Current Repeats: stepData.length
  stepData: Record<stepId, FormValues>;
  orderedStepIds: string[];
  // Populated (one key per shared fieldId) when the step has a sharedFields
  // behaviour, else empty/undefined. Doubles as the signal that the base step
  // is a separate "shared values" page (not an instance) — see the submit-time
  // fold in forms.ts (#1257).
  sharedData?: FormValues;
}

export type RepeatableStepSettings = Record<sourceStepId, RepeatableConfig>;
