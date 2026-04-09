import type { FormStep, RecipeFormStep } from "./form-step.type";
import type { Processor } from "./processor.type";

export interface ServiceContract {
  formId: string;
  title: string;
  description?: string; // Subtitle / additional information
  steps: FormStep[];
  processors?: Processor[];
  createdAt: Date;
  updatedAt: Date;
  version: string; // Semantic versioning
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
