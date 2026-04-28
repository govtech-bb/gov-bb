// These will be the types used internally in the system to render a form.

import z from "zod";
import { ClientFormStep } from "./field-mapper.type";
import { FieldValidationProperties } from "./validation.type";

export interface FormMeta {
  // Meta information for the client to render.
  formId: string;
  formTitle: string;
  formDescription?: string;
  schema: z.ZodObject<Record<string, z.ZodType<unknown>>>;
  steps: ClientFormStep[];
  defaultValues: Record<string, unknown>;
  validationProperties: Record<string, FieldValidationProperties>;
}
