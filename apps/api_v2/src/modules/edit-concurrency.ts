import { z } from "zod";

/** Database-issued edit identity; equality matters, not distance or ordering. */
export const EditVersion = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export type EditVersion = z.infer<typeof EditVersion>;
