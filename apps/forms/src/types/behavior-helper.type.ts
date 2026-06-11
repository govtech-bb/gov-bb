import {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";
import { ClientFormStep, FormValues } from "./field-mapper.type";
import { FormMeta } from "./renderer.type";

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

export interface AddRepeatableStepParams {
  currentStep: ClientFormStep;
  repeatableStepSettings: RepeatableStepSettings;
  repeatableBehaviour?: RepeatableBehaviour;
  sharedFieldsBehaviour?: SharedFieldsBehaviour;
  visibleSteps: ClientFormStep[];
  formMeta: FormMeta;
}

export interface RemoveRepeatableStepParams {
  currentStep: ClientFormStep;
  visibleSteps: ClientFormStep[];
  repeatableStepSettings: RepeatableStepSettings;
  formMeta: FormMeta;
}
