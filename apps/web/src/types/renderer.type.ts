// These will be the types used internally in the system to render a form.

import z from "zod";
import { ClientFormStep, FormValues } from "./field-mapper.type";
import { FieldValidationMethods } from "./validation.type";

export interface FormMeta {
  // Meta information for the client to render.
  schema: z.ZodObject<Record<string, z.ZodType<unknown>>>;
  steps: ClientFormStep[];
  defaultValues: Record<string, unknown>;
  validationMethods: Record<string, FieldValidationMethods>;

  isStepVisible(formStep: ClientFormStep, formValues: FormValues): boolean;
  getVisibleSteps(
    formSteps: ClientFormStep[],
    formValues: FormValues,
  ): ClientFormStep[];
}
