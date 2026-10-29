/**
 * Journey 5 (#3012): a certificate application is paid through EZ Pay and the
 * citizen gets their confirmation, on staging.
 *
 *   1. Walk and submit "Get a Death Certificate" for real. It is EZ Pay-gated
 *      ($5/copy), so the API answers `pending_payment` with an EZ Pay URL.
 *   2. Follow "Continue to payment" to the EZ Pay TEST host and pay with the
 *      test card.
 *   3. EZ Pay returns the browser through the API's return redirect, which
 *      verifies the payment with EZ Pay and finalises the submission. Assert
 *      the confirmation page says the payment was successful.
 *   4. When the test inbox is configured, wait for the applicant confirmation
 *      email (it is only sent once the payment is confirmed) and check it
 *      carries this submission's reference and the payment received.
 *
 * What this can't see: whether EZ Pay's server-to-server webhook also arrived.
 * The return redirect and the webhook share one verify-and-finalise path, so
 * the browser outcome is the same either way. The webhook's signature check is
 * covered over HTTP by apps/api/src/payments/payment-webhook.controller.http.spec.ts.
 *
 * Run by deploy-staging.yml after a deploy, gated by E2E_PAYMENTS_ENABLED.
 * It must NOT send X-Smoke-Submission: that token drops the payment.
 *
 * Assumes "Continue to payment" goes straight to the EZ Pay test host, and
 * that the API's FORMS_BASE_URL (or first CORS_ORIGIN) is SMOKE_BASE_URL, so
 * EZ Pay's return lands back on the same forms origin.
 *
 * Required env:
 *   SMOKE_BASE_URL          forms base URL (shared smoke convention)
 *   E2E_EZPAY_CARD_NUMBER   EZ Pay test-host card (never a real card)
 *   E2E_EZPAY_CARD_EXPIRY   its expiry, as the EZ Pay page asks for it (MM/YY)
 *   E2E_EZPAY_CARD_CVV      its security code
 * Optional (turns on step 4; see ../helpers/test-inbox):
 *   E2E_INBOX_BUCKET, E2E_INBOX_DOMAIN, E2E_INBOX_PREFIX + AWS credentials
 */
import { expect, test } from "@playwright/test";
import { fillDeathCertificate } from "../helpers/get-death-certificate";
import { testInboxAddress, waitForEmail } from "../helpers/test-inbox";

// EZ Pay's hosted page plus the return redirect's check_api round trip.
const PAYMENT_TIMEOUT = 120_000;
const EMAIL_TIMEOUT = 5 * 60_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Journey 5 needs ${name} to be set`);
  return value;
}

test.describe("Journey 5 — EZ Pay payment → confirmation (+ email)", () => {
  test("pays for a death certificate and gets the confirmation", async ({
    page,
  }) => {
    // It pays for real, so it never runs by accident in a whole-folder smoke
    // run. deploy-staging.yml fails before this if the card secrets are unset.
    test.skip(
      !process.env.E2E_EZPAY_CARD_NUMBER,
      "Journey 5 runs only with the EZ Pay test card set",
    );
    test.setTimeout(PAYMENT_TIMEOUT + EMAIL_TIMEOUT + 120_000);

    const card = {
      number: required("E2E_EZPAY_CARD_NUMBER"),
      expiry: required("E2E_EZPAY_CARD_EXPIRY"),
      cvv: required("E2E_EZPAY_CARD_CVV"),
    };
    const inboxEnabled = !!process.env.E2E_INBOX_BUCKET;
    const email = inboxEnabled
      ? testInboxAddress("j5-ezpay")
      : "testing@govtech.bb";
    const since = new Date();
    const formsOrigin = new URL(required("SMOKE_BASE_URL")).origin;

    // ─── 1. Submit: the API must gate it on payment ──────────────────────────
    await fillDeathCertificate(page, { email });
    const submission = page.waitForResponse(
      (res) =>
        res.url().includes("/submissions") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Submit" }).click();
    const response = await submission;
    expect(response.ok(), `POST /submissions → ${response.status()}`).toBe(
      true,
    );
    const body = await response.json();
    const referenceCode: string = body?.data?.referenceCode;
    expect(referenceCode, "submission should return a reference").toBeTruthy();
    expect(
      body?.data?.status,
      "the form must be payment-gated on this environment — is EZ Pay set in " +
        "form_config for get-death-certificate, and is X-Smoke-Submission unset?",
    ).toBe("pending_payment");
    expect(body?.meta?.deferred?.paymentUrl).toBeTruthy();

    // ─── 2. Pay on the EZ Pay test host ──────────────────────────────────────
    await page.getByRole("link", { name: "Continue to payment" }).click();
    await page.waitForURL((url) => url.origin !== formsOrigin, {
      timeout: PAYMENT_TIMEOUT,
    });
    // Guard against ever paying on the live gateway.
    expect(new URL(page.url()).hostname).toBe("test.ezpay.gov.bb");

    await page.getByLabel(/card number/i).fill(card.number);
    await page.getByLabel(/expir/i).fill(card.expiry);
    await page.getByLabel(/cvv|cvc|security code/i).fill(card.cvv);
    await page.getByRole("button", { name: /^pay/i }).click();

    // ─── 3. Back on the forms site, payment confirmed ────────────────────────
    await page.waitForURL(
      (url) =>
        url.origin === formsOrigin &&
        url.searchParams.get("step") === "submission-confirmation",
      { timeout: PAYMENT_TIMEOUT },
    );
    expect(
      new URL(page.url()).searchParams.get("payment"),
      "EZ Pay's check_api did not report Success on return (failed or still pending)",
    ).toBe("success");
    await expect(
      page.getByRole("heading", { name: "Your payment was successful" }),
    ).toBeVisible();

    // ─── 4. The confirmation email reaches the test inbox ───────────────────
    if (!inboxEnabled) {
      test.info().annotations.push({
        type: "skipped-step",
        description:
          "Email check off: E2E_INBOX_BUCKET is unset (test inbox not provisioned yet).",
      });
      return;
    }
    const mail = await waitForEmail({
      to: email,
      subjectIncludes: "Your death certificate request has been received",
      since,
      timeoutMs: EMAIL_TIMEOUT,
    });
    expect(mail.text + mail.html).toContain(referenceCode);
    expect(mail.text + mail.html).toContain("Payment amount received");
  });
});
