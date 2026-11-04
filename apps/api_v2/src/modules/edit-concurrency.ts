import { z } from "zod";

/** Database-issued edit identity; equality matters, not distance or ordering. */
export const EditVersion = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export type EditVersion = z.infer<typeof EditVersion>;

export const expectedVersionFields = {
  expected_version: EditVersion,
};

/** DELETE baselines use canonical decimal strings, without coercing malformed input. */
export const ExpectedVersionQuery = z.object({
  expected_version: z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .transform(Number)
    .pipe(EditVersion),
});

export const VersionCommandBody = z.object(expectedVersionFields);
