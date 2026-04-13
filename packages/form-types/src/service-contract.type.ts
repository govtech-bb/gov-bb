import type { FormStep, RecipeFormStep } from "./form-step.type";
import type { Processor } from "./processor.type";

export type DateTimeFormat =
  `${number}-${number}-${number}T${number}:${number}:${number}`; // YYYY-MM-DDTHH:MM:SS

export interface ServiceContract {
  formId: string;
  title: string;
  description?: string;
  steps: FormStep[];
  processors?: Processor[];
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}

export interface ServiceContractRecipe {
  formId: string;
  title: string;
  description: string;
  steps: RecipeFormStep[];
  processors?: Processor[];
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}
