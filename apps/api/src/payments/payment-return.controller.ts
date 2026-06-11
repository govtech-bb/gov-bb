import { Controller, Get, Logger, Query, Redirect } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  PaymentConfirmationOutcome,
  PaymentWebhookService,
} from "./payment-webhook.service";

/**
 * EzPay post-payment **return redirect** — the URL the citizen's browser is sent
 * to after completing (or abandoning) payment on the EzPay payment page. EzPay
 * appends `rid` (our payment reference), `tx` (transaction number) and
 * `payment_status`. Unlike the server-to-server webhook this is a browser GET,
 * so it confirms the payment (reusing the webhook's verify-and-finalise core)
 * and then 302-redirects the citizen to the form's confirmation page with the
 * resolved outcome. The return URL is configured merchant-side at EzPay.
 *
 * Exempt from throttling for the same reason as the webhook: a citizen returning
 * from payment must never be rate-limited off their own receipt.
 */
@ApiTags("Payments")
@Controller("payments/ezpay")
@SkipThrottle()
export class PaymentReturnController {
  private readonly logger = new Logger(PaymentReturnController.name);

  constructor(
    private readonly service: PaymentWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Get("redirect")
  @Redirect()
  async ezpayReturn(
    @Query("rid") rid?: string,
    @Query("tx") tx?: string,
    @Query("payment_status") paymentStatus?: string,
    // EzPay's return params are `rid`/`tx`; accept the webhook-style underscore
    // names too so a merchant configured either way still resolves.
    @Query("_reference") referenceAlt?: string,
    @Query("_transaction_number") transactionAlt?: string,
  ): Promise<{ url: string }> {
    const reference = rid ?? referenceAlt;
    const transactionNumber = tx ?? transactionAlt;
    const baseUrl = this.resolveFormsBaseUrl();

    if (!reference) {
      this.logger.warn(
        "EzPay return redirect received with no reference — sending citizen to site root",
      );
      return { url: baseUrl };
    }

    let outcome: PaymentConfirmationOutcome = "pending";
    let formId: string | undefined;
    try {
      ({ outcome, formId } = await this.service.confirmReturn({
        reference,
        transactionNumber,
      }));
    } catch (err) {
      // Never block the citizen's return on a confirmation error (e.g. EzPay
      // check_api unreachable). Land them on the payment step; the webhook and
      // the reconciliation cron remain the authoritative confirmation paths.
      this.logger.error(
        `EzPay return confirmation failed for reference ${reference} (declared=${paymentStatus ?? "?"}): ${String(err)}`,
      );
    }

    this.logger.log(
      `EzPay return for reference ${reference}: outcome=${outcome} formId=${formId ?? "?"} declared=${paymentStatus ?? "?"}`,
    );

    return { url: this.buildConfirmationUrl(baseUrl, formId, outcome) };
  }

  /**
   * Where to bounce the citizen after payment. Prefer an explicit
   * `FORMS_BASE_URL`; otherwise fall back to the first configured CORS origin —
   * on every deployed environment that is the public forms site, so the redirect
   * works without a dedicated env var. Local dev default last.
   */
  private resolveFormsBaseUrl(): string {
    const explicit = this.config.get<string>("FORMS_BASE_URL");
    if (explicit) return explicit;
    const cors = this.config.get<string>("CORS_ORIGIN") ?? "";
    const first = cors
      .split(",")
      .map((o) => o.trim())
      .find(Boolean);
    return first ?? "http://localhost:3000";
  }

  private buildConfirmationUrl(
    baseUrl: string,
    formId: string | undefined,
    outcome: PaymentConfirmationOutcome,
  ): string {
    // Without a formId we can't target the form's confirmation route (e.g. the
    // reference didn't resolve to a payment) — send the citizen to the site root.
    if (!formId) return baseUrl;
    const url = new URL(`/forms/${encodeURIComponent(formId)}/`, baseUrl);
    url.searchParams.set("step", "submission-confirmation");
    // Only success/failed drive a UI change; a still-pending outcome lands on
    // the confirmation step with its stored "Continue to payment" state intact.
    if (outcome === "success") url.searchParams.set("payment", "success");
    else if (outcome === "failed") url.searchParams.set("payment", "failed");
    return url.toString();
  }
}
