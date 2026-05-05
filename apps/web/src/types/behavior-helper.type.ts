import { FormValues } from "./field-mapper.type";

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
