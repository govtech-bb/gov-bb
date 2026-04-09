import type { FormStep, RecipeFormStep } from "./form-step.type";
import type { Processor } from "./processor.type";

export interface ServiceContract {
  formId: string;
  title: string;
  description?: string;
  steps: FormStep[];
  processors?: Processor[];
  createdAt: Date;
  updatedAt: Date;
  version: string;
}

export interface ServiceContractRecipe {
  formId: string;
  title: string;
  description: string;
  steps: RecipeFormStep[];
  processors?: Processor[];
  createdAt: Date;
  updatedAt: Date;
  version: string;
}
