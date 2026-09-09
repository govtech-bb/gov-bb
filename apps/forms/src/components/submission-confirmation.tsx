import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { interpolateConfirmationMarkdown } from "@govtech-bb/form-conditions";
import { markdownUrlTransform } from "./markdown-url-transform";
import { LANDING_URL } from "../config/landing";
import { isSafePaymentUrl } from "../lib/security/safe-payment-url";
import { SubmissionConfirmationProps } from "../types/props.type";
import {
  Button,
  Heading,
  LinkButton,
  List,
  Payment,
  ServiceHeading,
  SummaryList,
  Text,
} from "@govtech-bb/react";

// Backend sends amounts as plain numbers; tests/recipes may already include the
// "$". Prefix only when missing so both inputs render "$20".
const formatMoney = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return undefined;
  const str = String(value).trim();
  return str.startsWith("$") ? str : `$${str}`;
};

// `submittedAt` arrives as an ISO string; recipes/tests may pass a pre-formatted
// DD/MM/YYYY value. Pass through anything already containing "/", otherwise
// render Barbados-style day/month/year.
const formatDate = (value?: string) => {
  if (!value) return value;
  if (value.includes("/")) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-GB");
};

export default function SubmissionConfirmation({
  serviceTitle,
  stepTitle,
  processingMessage,
  nextSteps,
  markdownContent,
  contactDetails,
  onTryAgain,
  onPaymentInitiated,
  hideReferenceNumber,
  submissionState,
  feedbackUrl,
}: SubmissionConfirmationProps) {
  // submissionState is rehydrated from session storage, so it survives a
  // refresh on this step. When it is genuinely absent (the step was reached
  // without a submission) there is nothing to confirm — the form-renderer
  // redirects away and rendering null here avoids fabricating a fake receipt.
  // The stored value is display-only; the real submission/payment outcome is
  // authoritative server-side.
  if (!submissionState) {
    return null;
  }

  const {
    hasPayment,
    serviceName,
    amount,
    unitPrice,
    quantity,
    submissionSuccess,
    paymentSuccess,
    processing,
    referenceNumber,
    date,
    paymentUrl,
    paymentDescription,
    polyclinic,
    polyclinicContact,
  } = submissionState;

  // Substitute the resolved polyclinic name into the recipe's `{polyclinic}`
  // token (coordinate-routed forms only), its single contact line into
  // `{polyclinicContact}` (so only the routed clinic's details are shown,
  // #254), and the landing origin into `{landingUrl}` so authored links to a
  // service page resolve to this environment's landing site rather than to the
  // forms host this page is served from. Shared with the applicant email via
  // interpolateConfirmationMarkdown so the page and email copy can't drift
  // (#2201).
  const resolvedMarkdown = interpolateConfirmationMarkdown(markdownContent, {
    polyclinic,
    polyclinicContact,
    landingUrl: LANDING_URL,
  });

  const paymentRows = (
    paymentSuccess
      ? [
          { key: "Service:", value: paymentDescription || serviceName },
          { key: "Amount:", value: formatMoney(amount) },
          { key: "Date:", value: formatDate(date) },
        ]
      : [
          { key: "Service:", value: paymentDescription || serviceName },
          { key: "Unit price:", value: formatMoney(unitPrice) },
          { key: "Quantity:", value: quantity },
          { key: "Amount:", value: formatMoney(amount) },
        ]
  ).filter(
    ({ value }) => value !== undefined && value !== null && value !== "",
  );

  // Trailing sections (what-happens-next, contact, feedback) are shared by every
  // successful state — payment or not — and rendered below the lead panel.
  const trailingSections = (
    <>
      {nextSteps && nextSteps.length > 0 && (
        <div className="form-page__next-steps flex flex-col gap-8">
          {nextSteps.map((section, index) => (
            <div key={index} className="flex flex-col gap-4">
              <Heading as="h2">{section.title}</Heading>
              {section.content && <Text>{section.content}</Text>}
              {section.items && section.items.length > 0 && (
                <List variant="bullet">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </List>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Print the confirmation (submission ID, next steps, contact) for
          citizens who need a paper copy. Sits directly after "what happens
          next" so it's adjacent to the content it prints. The button itself is
          hidden in the printed output via the `form-page__print` @media print
          rule in govtech.css. */}
      <div className="form-page__print">
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {resolvedMarkdown && (
        <div className="form-page__markdown-content govbb-prose wrap-anywhere">
          {/* Recipe-authored copy (e.g. "What you need to know"). react-markdown
              escapes raw HTML by default and we deliberately omit rehype-raw, so
              recipe content cannot inject markup. */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={markdownUrlTransform}
          >
            {resolvedMarkdown}
          </ReactMarkdown>
        </div>
      )}

      {contactDetails && (
        <div className="form-page__contact">
          <Text>If you need help with your application, contact:</Text>
          {/* title/telephone/email are each optional (issue #607) — render
              only the lines that are present so a partial contact (e.g. an
              email-only MDA) doesn't show empty labels or a blank heading. */}
          {contactDetails.title && (
            <Heading as="h3">{contactDetails.title}</Heading>
          )}
          <div className="form-page__contact-body govbb-text-break-word">
            {contactDetails.address && (
              <>
                <Text>{contactDetails.address.line1}</Text>
                {contactDetails.address.line2 && (
                  <Text>{contactDetails.address.line2}</Text>
                )}
                <Text>{contactDetails.address.city}</Text>
                {contactDetails.address.country && (
                  <Text>{contactDetails.address.country}</Text>
                )}
              </>
            )}
            {contactDetails.telephoneNumber && (
              <Text>
                <Text as="span" weight="bold">
                  Telephone:
                </Text>{" "}
                {contactDetails.telephoneNumber}
              </Text>
            )}
            {contactDetails.email && (
              <Text>
                <Text as="span" weight="bold">
                  Email:
                </Text>{" "}
                {contactDetails.email}
              </Text>
            )}
          </div>
        </div>
      )}

      {/* Only invite feedback when a target is provided. The exit survey's own
          confirmation passes no feedbackUrl, so it never links to itself. */}
      {feedbackUrl && (
        <section className="mt-8 flex flex-col items-start gap-2 no-print">
          <Heading as="h2" size="h3">
            Help us improve this service
          </Heading>
          <Text>
            We are always working to improve government services. If you have a
            moment, you can tell us about your experience today.
          </Text>
          <LinkButton variant="secondary" href={feedbackUrl}>
            Give feedback on this service
          </LinkButton>
          <Text>
            This will take about 30 seconds. Your responses are anonymous.
          </Text>
        </section>
      )}
    </>
  );

  // Submission is in flight — an idempotency-key replay returned `processing`
  // (#463). Show a neutral status panel with the reference number, but none of
  // the finished-submission furniture: no Try again (nothing failed), no
  // payment block, and no trailing next-steps/contact/feedback (it isn't a
  // completed submission yet).
  if (processing) {
    return (
      <>
        <div className="form-page__panel--success govbb-main-wrapper">
          <div className="govbb-width-container govbb-grid-row">
            <ServiceHeading
              className="govbb-grid-column-two-thirds-from-desktop"
              service={serviceTitle}
              description="We've received your submission and it's being processed. We'll email you when it's complete."
            >
              We&apos;re processing your submission
            </ServiceHeading>
          </div>
        </div>
        {referenceNumber && (
          <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
            <div className="govbb-grid-column-two-thirds-from-desktop form-page__confirmation">
              <SummaryList
                className="form-page__reference"
                rows={[{ key: "Submission ID", value: referenceNumber }]}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  // Submission itself failed — nothing was saved. Show a focused error panel.
  if (!submissionSuccess) {
    return (
      <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
        <div className="govbb-grid-column-two-thirds-from-desktop">
          <Payment
            outcome="failed"
            title="Something went wrong"
            description="We could not process your submission. No information has been saved. Please try again — if the problem continues, contact support."
          >
            <Button
              variant="secondary"
              className="no-print"
              onClick={onTryAgain}
            >
              Try again
            </Button>
          </Payment>
        </div>
      </div>
    );
  }

  // No-payment confirmation — full-width teal banner header, then trailing
  // sections. (fig: "Thank you for your request")
  if (!hasPayment) {
    return (
      <>
        <div className="form-page__panel--success govbb-main-wrapper">
          <div className="govbb-width-container govbb-grid-row">
            <ServiceHeading
              className="govbb-grid-column-two-thirds-from-desktop"
              service={serviceTitle}
              description={
                processingMessage ?? "Your submission has been saved"
              }
            >
              {stepTitle}
            </ServiceHeading>
          </div>
        </div>
        <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
          <div className="govbb-grid-column-two-thirds-from-desktop form-page__confirmation">
            {referenceNumber && !hideReferenceNumber && (
              <SummaryList
                className="form-page__reference"
                rows={[{ key: "Submission ID", value: referenceNumber }]}
              />
            )}
            {trailingSections}
          </div>
        </div>
      </>
    );
  }

  // Payment flow — plain white header, then the payment-state panel.
  return (
    <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
      <div className="govbb-grid-column-two-thirds-from-desktop form-page__confirmation">
        <ServiceHeading
          service={serviceTitle}
          description={processingMessage || undefined}
        >
          {stepTitle}
        </ServiceHeading>

        {referenceNumber &&
          (paymentSuccess || isSafePaymentUrl(paymentUrl)) && (
            <SummaryList
              className="form-page__reference"
              rows={[{ key: "Submission ID", value: referenceNumber }]}
            />
          )}

        {paymentSuccess ? (
          <Payment
            outcome="success"
            title="Your payment was successful"
            description="Your payment has been received. We've sent a confirmation email to the address you provided."
            rows={paymentRows}
          />
        ) : isSafePaymentUrl(paymentUrl) ? (
          <Payment
            title="Complete your payment"
            description="Please review and complete your payment to finalize your submission"
            rows={paymentRows}
            note="You will be redirected to EZ Pay to securely complete your payment."
          >
            <LinkButton
              className="no-print"
              href={paymentUrl}
              onClick={() => onPaymentInitiated?.()}
            >
              Continue to payment
            </LinkButton>
          </Payment>
        ) : (
          <Payment
            outcome="failed"
            title="Unfortunately, your payment was unsuccessful"
            description="Your payment could not be processed. You have not been charged."
          >
            <Button
              variant="secondary"
              className="no-print"
              onClick={onTryAgain}
            >
              Try again
            </Button>
          </Payment>
        )}

        {(paymentSuccess || isSafePaymentUrl(paymentUrl)) && trailingSections}
      </div>
    </div>
  );
}
