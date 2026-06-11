import { z } from "zod";

export const formSearchParamSchema = z.object({
  step: z.string().optional(),
  preview: z.string().optional(),
  /**
   * The id of the form a citizen came from when sent to a feedback form (e.g.
   * the exit survey's "Give feedback on this service" link sets
   * `?source=<originating-formId>`). Seeded into the conventional
   * `referring-service` field so the feedback submission records which form it
   * is about. Harmless on forms that don't declare that field — it is dropped.
   */
  source: z.string().optional(),
});

export type FormSearchParams = z.infer<typeof formSearchParamSchema>;
