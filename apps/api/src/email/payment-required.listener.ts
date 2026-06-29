import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import { EmailTemplateService } from "./email-template.service";
import { SesMailer } from "./ses-mailer";
import type { PaymentRequiredEvent } from "../forms/submissions/submissions.types";

const PAYMENT_REQUIRED_TEMPLATE = "payment-required";

/**
 * Sends the pre-payment "payment required" email to the citizen the moment a
 * payment session is initiated (the `payment.required` event emitted by
 * `PaymentProcessor`). This runs *before* the citizen pays, so it shows the
 * amount due and a pay link — never a transaction ID or amount paid, which only
 * exist after payment succeeds.
 *
 * Delivery is best-effort: the citizen already received the pay URL on-screen
 * from the submit response, so a failed/slow send must never disrupt the flow.
 * The handler logs and swallows errors rather than rethrowing.
 */
@Injectable()
export class PaymentRequiredListener {
  private readonly logger = new Logger(PaymentRequiredListener.name);

  constructor(
    private readonly formDefs: FormDefinitionsService,
    private readonly templateService: EmailTemplateService,
    private readonly mailer: SesMailer,
  ) {}

  @OnEvent("payment.required", { async: true })
  async handlePaymentRequired(event: PaymentRequiredEvent): Promise<void> {
    try {
      const contract = await this.formDefs.findByFormId({
        formId: event.formId,
      });
      const formTitle = contract.title;

      const html = this.templateService.render(PAYMENT_REQUIRED_TEMPLATE, {
        formTitle,
        referenceCode: event.referenceCode,
        amountDue: `$${event.amount.toFixed(2)}`,
        description: event.description,
        paymentUrl: event.paymentUrl,
        coatOfArmsUrl: this.mailer.coatOfArmsUrl,
        year: String(new Date().getFullYear()),
      });

      if (html === null) {
        this.logger.warn(
          `[payment-required] Template render returned null for submission ${event.submissionId} — email not sent`,
        );
        return;
      }

      await this.mailer.sendSimple({
        to: event.customerEmail,
        subject: `Payment required to complete your ${formTitle} request`,
        html,
      });

      this.logger.log(
        `[payment-required] Sent to ${event.customerEmail} for submission ${event.submissionId}`,
      );
    } catch (err) {
      // Best-effort: never let a failed acknowledgement disrupt the flow.
      this.logger.error(
        `[payment-required] Failed to send for submission ${event.submissionId}`,
        err,
      );
    }
  }
}
