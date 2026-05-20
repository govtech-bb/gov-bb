import { z } from "zod";

export const formSearchParamSchema = z.object({
  step: z.string().optional(),
});
