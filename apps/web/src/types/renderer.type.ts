// These will be the types used internally in the system to render a form.

import { ClientFormStep, FormValues } from "./field-mapper.type";

export interface FormMeta { // Meta information for the client to render.
  steps: ClientFormStep[];
  defaultValues: Record<string, unknown>;

  isStepVisible(formStep: ClientFormStep, formValues: FormValues): boolean;
  getVisibleSteps(formValues: FormValues): ClientFormStep[];
}
