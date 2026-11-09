import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { FormDefinitionsService } from "../forms/form-definitions/form-definitions.service";
import { NotificationLogRepository } from "../forms/submissions/notification-log.repository";
import { NotificationOutcome } from "@/database/entities/notification-log.entity";
import { EmailTemplateService } from "./email-template.service";
import { SesMailer } from "./ses-mailer";
import type { PaymentRequiredEvent } from "../forms/submissions/submissions.types";

const PAYMENT_REQUIRED_TEMPLATE = "payment-required";

/** notification_log.recipient_kind for this email: the citizen's pay-link
 *  email, as distinct from `submitted` (their confirmation after submit). */
export const PAYMENT_REQUIRED_RECIPIENT_KIND = "payment";

/**
 * Sends the pre-payment "payment required" email to the citizen the moment a
 * payment session is initiated (the `payment.required` event emitted by
 * `PaymentProcessor`). This runs *before* the citizen pays, so it shows the
 * amount due and a pay link — never a transaction ID or amount paid, which only
 * exist after payment succeeds.
 *
 * Each send is recorded to notification_log (kind `payment`) with its SES
 * MessageId, so the SesEventConsumer can reconcile delivery and bounces onto it
 * like any submission email.
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
    private readonly notificationLog: NotificationLogRepository,
  ) {}

  @OnEvent("payment.required", { async: true })
  async handlePaymentRequired(event: PaymentRequiredEvent): Promise<void> {
    try {
      // Bypass visibility (#2125): the submission requiring payment already
      // exists, so resolve the published contract regardless of the form's
      // current visibility.
      const contract = await this.formDefs.findByFormId({
        formId: event.formId,
        bypassVisibility: true,
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

      let messageId: string | undefined;
      try {
        messageId = await this.mailer.sendSimple({
          to: event.customerEmail,
          subject: `Payment required to complete your ${formTitle} request`,
          html,
        });
      } catch (err) {
        await this.record(event, NotificationOutcome.FAILED, {
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      // Record before logging success. SES events for this send match on
      // provider_message_id, so the sooner the row exists the fewer retries.
      await this.record(event, NotificationOutcome.SENT, {
        providerMessageId: messageId ?? null,
      });

      this.logger.log(
        `[payment-required] Sent for submission ${event.submissionId}`,
      );
    } catch (err) {
      // Best-effort: never let a failed acknowledgement disrupt the flow.
      this.logger.error(
        `[payment-required] Failed to send for submission ${event.submissionId}`,
        err,
      );
    }
  }

  /** Best-effort: NotificationLogRepository.record never throws. */
  private record(
    event: PaymentRequiredEvent,
    outcome: NotificationOutcome,
    fields: { error?: string; providerMessageId?: string | null },
  ): Promise<void> {
    return this.notificationLog.record({
      submissionId: event.submissionId,
      formId: event.formId,
      referenceCode: event.referenceCode,
      recipientKind: PAYMENT_REQUIRED_RECIPIENT_KIND,
      recipient: event.customerEmail,
      outcome,
      error: fields.error ?? null,
      providerMessageId: fields.providerMessageId ?? null,
    });
  }
}
