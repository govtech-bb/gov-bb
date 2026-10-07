// These will be the types used internally in the system to render a form.

import { ContactDetails } from "@govtech-bb/form-types";
import { ClientFormStep } from "./field-mapper.type";
import { FieldValidationProperties } from "./validation.type";
import { RepeatableStepSettings } from "./repeatable.type";
type stepId = string;
type fieldId = string;

export interface FormMeta {
  // Meta information for the client to render.
  formId: string;
  formTitle: string;
  formDescription?: string;
  contactDetails?: ContactDetails;
  /** Application deadline (#1936); when past, the closed page is shown. */
  closingDateTime?: string;
  steps: ClientFormStep[];
  /** The contract's steps before `setupRepeatSteps` split the repeatables
   * across a shared page and one page per instance. The printed confirmation
   * builds its sections from these, so the paper copy carries each instance's
   * own answers in the order the recipe asks for them — the same list, in the
   * same order, that the API renders the MDA email from. */
  contractSteps: ClientFormStep[];
  defaultValues: Record<string, unknown>;
  validationProperties: Record<string, FieldValidationProperties>;
  stepConditionalTargets: Record<stepId, fieldId>;
  repeatSettings: RepeatableStepSettings;
  idempotencyKey: string;
}
