// These will be the types used internally in the system to render a form.

import { ContactDetails } from "@govtech-bb/form-types";
import { ClientFormStep } from "./field-mapper.type";
import { FieldValidationProperties } from "./validation.type";
import { RepeatableStepSettings } from "./behavior-helper.type";
type stepId = string;
type fieldId = string;

export interface FormMeta {
  // Meta information for the client to render.
  formId: string;
  version: string;
  formTitle: string;
  formDescription?: string;
  contactDetails?: ContactDetails;
  steps: ClientFormStep[];
  defaultValues: Record<string, unknown>;
  validationProperties: Record<string, FieldValidationProperties>;
  stepConditionalTargets: Record<stepId, fieldId>;
  repeatSettings: RepeatableStepSettings;
  idempotencyKey: string;
}
