import z from "zod";
import { processorSchema } from "./processor.type";

// Schema for the per-form `form_config.config` JSONB blob (per-environment DB
// config that never enters the recipe — ADR 0033). `processors` carries
// author-time processor entries: dynamic() fields are allowed and resolved by
// the expressions pipeline at submission, exactly as for recipe processors.
//
// Loose on purpose: the blob is a shared envelope, so unknown future keys must
// survive parsing (and writers must merge into the blob, never overwrite it).
export const formConfigBlobSchema = z.looseObject({
  processors: z.array(processorSchema).optional(),
});

export type FormConfigBlob = z.infer<typeof formConfigBlobSchema>;

// Parse helper shared by readers of the blob (API hydration, builder API).
// `null`/`undefined` is a resolved miss — the column is nullable — and maps to
// an empty blob. Anything else must parse or this throws: an invalid blob is
// misconfiguration and must fail loudly (silently dropping a payment processor
// would make a paid form free).
export function parseFormConfigBlob(value: unknown): FormConfigBlob {
  if (value === null || value === undefined) return {};
  return formConfigBlobSchema.parse(value);
}
