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
  stepData: Record<stepId, FormValues[]>;
  orderedStepIds: string[];
  sharedData?: FormValues;
}

export type RepeatableStepSettings = Record<sourceStepId, RepeatableConfig>;

export interface AddRepeatableStepParams {
  currentStep: ClientFormStep;
  repeatableStepSettings: RepeatableStepSettings;
  repeatableBehaviour?: RepeatableBehaviour;
  sharedFieldsBehaviour?: SharedFieldsBehaviour;
  visibleSteps: ClientFormStep[];
  stepValues: FormValues[];
  formMeta: FormMeta;
}

export interface RemoveRepeatableStepParams {
  currentStep: ClientFormStep;
  visibleSteps: ClientFormStep[];
  currentRepeatConfig: RepeatableConfig;
  formMeta: FormMeta;
}
