import { FormValues, formValuesSchema } from "../field-mapper.type";
import { z } from "zod";

export interface FormDraft {
  draftId: string;
  formId: string;
  values: FormValues;
  lastActiveStep: string;
}

export const formDraftResponseBodySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  draftId: z.string(),
  formId: z.string(),
  // #1196: versionless drafts return null; tolerate any/absent shape.
  formVersion: z.string().nullable().optional(),
  values: formValuesSchema,
  lastActiveStep: z.string(),
  status: z.string(),
  lastActiveAt: z.string(),
});

export type FormDraftResponseBody = z.infer<typeof formDraftResponseBodySchema>;
