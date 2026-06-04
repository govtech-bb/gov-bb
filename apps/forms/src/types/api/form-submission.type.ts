import z from "zod";
import { FormValues } from "../field-mapper.type";

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
  // `values` is the server's echo of the submitted answers. The client does
  // not read it back here (the confirmation screen needs only id / submittedAt
  // / formId), and its real shape is richer than a flat record — repeatable
  // steps are `Array<FormValues>` and file fields are arrays of upload-ref
  // objects (see FormValuesByStep). Validating it strictly here rejected those
  // valid shapes and made postFormSubmission throw, bouncing the user off the
  // confirmation screen (#606). Treat it as opaque; it was already validated at
  // submit time.
  values: z.record(z.string(), z.unknown()),
  meta: z.unknown(),
  submittedAt: z.string(),
  // Human-readable reference shown on the confirmation screen (e.g.
  // "JPP-20260604-130732-9JZRZC"). Optional so an older API deploy that does
  // not yet return this field still passes validation — the client falls back
  // to `id` (the UUID) in that case.
  referenceCode: z.string().optional(),
});

export type FormSubmissionResponseBody = z.infer<
  typeof formSubmissionResponseBodySchema
>;
