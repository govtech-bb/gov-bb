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

export interface FormDraftResponseBody {
  id: string;
  createdAt: string;
  updatedAt: string;
  draftId: string;
  formId: string;
  formVersion: string;
  values: FormValues;
  lastActiveStep: string;
  status: string;
  lastActiveAt: string;
}
