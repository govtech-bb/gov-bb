import { z } from "zod";

export const formSearchParamSchema = z.object({
  step: z.string().optional(),
  /**
   * Operator visibility-bypass token (`?preview=`). Forwarded as
   * `X-Recipe-Preview` so a reviewer sees and submits the *published* recipe of
   * a non-public form exactly as a citizen would once it launches (#1682).
   */
  preview: z.string().optional(),
  /**
   * Operator DB-draft token (`?draft=`). Forwarded as `X-Recipe-Draft` so a
   * reviewer sees the in-progress builder scratch; submission stays blocked
   * (#1682).
   */
  draft: z.string().optional(),
  /**
   * The id of the form a citizen came from when sent to a feedback form (e.g.
   * the exit survey's "Give feedback on this service" link sets
   * `?source=<originating-formId>`). Seeded into the conventional
   * `referring-service` field so the feedback submission records which form it
   * is about. Harmless on forms that don't declare that field — it is dropped.
   */
  source: z.string().optional(),
  /**
   * Set by the EzPay return redirect (`/payments/ezpay/redirect`) when it bounces
   * the citizen back to the confirmation step after payment: `success` flips the
   * confirmation to the paid receipt; `failed` shows the payment-failure panel.
   * Absent on the normal in-app flow.
   */
  payment: z.enum(["success", "failed"]).optional(),
});

export type FormSearchParams = z.infer<typeof formSearchParamSchema>;
