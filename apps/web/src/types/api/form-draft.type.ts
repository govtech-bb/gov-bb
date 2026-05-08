import { FormValues, formValuesSchema } from "../field-mapper.type";
import { z } from "zod";

export interface FormDraft {
  draftId: string;
  formId: string;
  version: string;
  values: FormValues;
  lastActiveStep: string;
}

export const formDraftResponseBodySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draftId: z.string(),
  formId: z.string(),
  formVersion: z.string(),
  values: formValuesSchema,
  lastActiveStep: z.string(),
  status: z.string(),
  lastActiveAt: z.string(),
});

export type FormDraftResponseBody = z.infer<typeof formDraftResponseBodySchema>;
