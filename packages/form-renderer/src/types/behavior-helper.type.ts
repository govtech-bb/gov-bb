import {
  RepeatableBehaviour,
  SharedFieldsBehaviour,
} from "@govtech-bb/form-types";
import { ClientFormStep } from "./field-mapper.type";
import { FormMeta } from "./renderer.type";
import { RepeatableStepSettings } from "./repeatable.type";

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
