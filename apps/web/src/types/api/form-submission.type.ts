import z from "zod";
import { FormValues, formValuesSchema } from "../field-mapper.type";

type stepId = string;

export interface FormSubmissionBody {
  formId: string;
  formVersion: string;
  draftId?: string;
  values: Record<stepId, FormValues>;
}

export const formSubmissionResponseBodySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  idempotencyKey: z.string(),
  formId: z.string(),
  formVersion: z.string(),
  status: z.string(),
  values: z.record(z.string(), formValuesSchema),
  meta: z.unknown(),
  submittedAt: z.string(),
});

export type FormSubmissionResponseBody = z.infer<
  typeof formSubmissionResponseBodySchema
>;
