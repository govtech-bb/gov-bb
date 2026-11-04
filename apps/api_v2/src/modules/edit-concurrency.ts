import { z } from "zod";

/** Database-issued edit identity; equality matters, not distance or ordering. */
export const EditVersion = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export type EditVersion = z.infer<typeof EditVersion>;

/** Optional only at the transport boundary so omission receives 428 rather than 400. */
export const expectedVersionFields = {
  expected_version: EditVersion.optional(),
};
export const expectedCollectionVersionFields = {
  expected_collection_version: EditVersion.optional(),
};

/** DELETE baselines use canonical decimal strings, without coercing malformed input. */
export const ExpectedVersionQuery = z.object({
  expected_version: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .transform(Number)
    .pipe(EditVersion)
    .optional(),
});

/** Fastify represents bodyless POSTs as null; both missing forms must reach 428. */
export const VersionCommandBody = z.object(expectedVersionFields).nullish();

/** Missing preconditions reveal nothing about whether the requested target exists. */
export const preconditionRequired = {
  error: "precondition_required",
  message: "Send the required version fields from the item you loaded.",
} as const;
