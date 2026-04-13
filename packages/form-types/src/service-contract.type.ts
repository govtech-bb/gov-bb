import { z } from "zod";
import { formStepSchema } from "./form-step.type";
import { processorSchema } from "./processor.type";

export const dateTimeFormatSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
export type DateTimeFormat = z.infer<typeof dateTimeFormatSchema>;


export const serviceContractSchema = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  steps: z.array(formStepSchema),
  processors: z.array(processorSchema).optional(),
  createdAt: dateTimeFormatSchema,
  updatedAt: dateTimeFormatSchema,
  version: z.string(),
});
export type ServiceContract = z.infer<typeof serviceContractSchema>;

export interface ServiceContractRecipe {
  formId: string;
  title: string;
  description: string;
  steps: Array<any>;
  processors?: Array<any>;
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}
