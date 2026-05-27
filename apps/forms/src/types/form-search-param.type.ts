import { z } from "zod";

export const formSearchParamSchema = z.object({
  step: z.string().optional(),
  preview: z.string().optional(),
});

export type FormSearchParams = z.infer<typeof formSearchParamSchema>;
