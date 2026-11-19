import type {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";
import type { ClientFormStep } from "./field-mapper.type";
import type { FormMeta } from "./renderer.type";
import type { RepeatableStepSettings } from "./repeatable.type";

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
