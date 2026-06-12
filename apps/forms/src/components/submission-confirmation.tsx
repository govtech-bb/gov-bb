import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./markdown-components";
import { isSafePaymentUrl } from "../lib/security/safe-payment-url";
import { SubmissionConfirmationProps } from "../types/props.type";

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
    referenceNumber,
    date,
    paymentUrl,
    paymentDescription,
  } = submissionState;

  const serviceLabel = paymentDescription || serviceName;
  const formattedAmount = formatMoney(amount);
  const formattedUnitPrice = formatMoney(unitPrice);
  const formattedDate = formatDate(date);

  // One label/value row of the govbb-payment block. Returns null for empty
  // values so optional rows (unit price, quantity) drop out cleanly.
  const paymentItem = (label: string, value?: React.ReactNode) =>
    value === undefined || value === null || value === "" ? null : (
      <div className="govbb-payment__item" key={label}>
        <p className="govbb-payment__item-label">{label}</p>
        <p className="govbb-payment__item-value">{value}</p>
      </div>
    );

  // Trailing sections (what-happens-next, contact, feedback) are shared by every
  // successful state — payment or not — and rendered below the lead panel.
  const trailingSections = (
    <>
      {nextSteps && nextSteps.length > 0 && (
        <div className="form-page__next-steps">
          {nextSteps.map((section, index) => (
            <div key={index}>
              <h2 className="govbb-text-h2">{section.title}</h2>
              {section.content && <p>{section.content}</p>}
              {section.items && section.items.length > 0 && (
                <ul className="govbb-list govbb-list--bullet">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {markdownContent && (
        <div className="form-page__markdown-content">
          {/* Recipe-authored copy (e.g. "What you need to know"). react-markdown
              escapes raw HTML by default and we deliberately omit rehype-raw, so
              recipe content cannot inject markup. */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>
      )}

      {contactDetails && (
        <div className="form-page__contact">
          <p>If you need help with your application, contact:</p>
          {/* title/telephone/email are each optional (issue #607) — render
              only the lines that are present so a partial contact (e.g. an
              email-only MDA) doesn't show empty labels or a blank heading. */}
          {contactDetails.title && (
            <h3 className="govbb-text-h3">{contactDetails.title}</h3>
          )}
          <div className="form-page__contact-body">
            {contactDetails.address && (
              <>
                <p>{contactDetails.address.line1}</p>
                {contactDetails.address.line2 && (
                  <p>{contactDetails.address.line2}</p>
                )}
                <p>{contactDetails.address.city}</p>
                {contactDetails.address.country && (
                  <p>{contactDetails.address.country}</p>
                )}
              </>
            )}
            {contactDetails.telephoneNumber && (
              <p>
                <span className="form-page__contact-label">Telephone:</span>{" "}
                {contactDetails.telephoneNumber}
              </p>
            )}
            {contactDetails.email && (
              <p>
                <span className="form-page__contact-label">Email:</span>{" "}
                {contactDetails.email}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Only invite feedback when a target is provided. The exit survey's own
          confirmation passes no feedbackUrl, so it never links to itself. */}
      {feedbackUrl && (
        <div className="form-page__feedback">
          <h3 className="govbb-text-h3">Help us improve this service</h3>
          <p>
            We are always working to improve government services. If you have a
            moment, you can tell us about your experience today.
          </p>
          {/* Renders as a link (not a button) styled as a secondary action —
              the same pattern as the "Continue to payment" anchor above. */}
          <a className="govbb-btn--secondary" href={feedbackUrl}>
            Give feedback on this service
          </a>
          <p>This will take about 30 seconds. Your responses are anonymous.</p>
        </div>
      )}
    </>
  );

  // Submission itself failed — nothing was saved. Show a focused error panel.
  if (!submissionSuccess) {
    return (
      <div className="container py-8 lg:py-16">
        <div className="form-width">
          <section className="govbb-payment govbb-payment--failed">
            <div className="govbb-payment__header">
              <h2 className="govbb-payment__title">Something went wrong</h2>
              <p className="govbb-payment__description">
                We could not process your submission. No information has been
                saved. Please try again — if the problem continues, contact
                support.
              </p>
            </div>
            <button className="govbb-btn--secondary" onClick={onTryAgain}>
              Try again
            </button>
          </section>
        </div>
      </div>
    );
  }

  // No-payment confirmation — full-width teal banner header, then trailing
  // sections. (fig: "Thank you for your request")
  if (!hasPayment) {
    return (
      <>
        <div className="form-page__panel form-page__panel--success">
          <div className="container">
            <div className="form-width form-page__panel-body">
              <p className="form-page__panel-service-title">{serviceTitle}</p>
              <h1 className="govbb-text-h1">{stepTitle}</h1>
              <p className="form-page__panel-subheading">
                {processingMessage ?? "Your submission has been saved"}
              </p>
            </div>
          </div>
        </div>
        <div className="container pb-8 lg:pb-16">
          <div className="form-width form-page__confirmation">
            {referenceNumber && (
              <dl className="form-page__reference">
                <dt>Submission ID</dt>
                <dd>{referenceNumber}</dd>
              </dl>
            )}
            {trailingSections}
          </div>
        </div>
      </>
    );
  }

  // Payment flow — plain white header, then the payment-state panel.
  return (
    <div className="container pb-8 lg:pb-16">
      <div className="form-width form-page__confirmation">
        <div className="form-page__header form-page__confirmation-header">
          <p className="form-page__service-title">{serviceTitle}</p>
          <h1 className="govbb-text-h1">{stepTitle}</h1>
          {processingMessage && (
            <p className="form-page__step-description">{processingMessage}</p>
          )}
        </div>

        {referenceNumber &&
          (paymentSuccess || isSafePaymentUrl(paymentUrl)) && (
            <dl className="form-page__reference">
              <dt>Submission ID</dt>
              <dd>{referenceNumber}</dd>
            </dl>
          )}

        {paymentSuccess ? (
          <section className="govbb-payment govbb-payment--success">
            <div className="govbb-payment__header">
              <h2 className="govbb-payment__title">
                Your payment was successful
              </h2>
              <p className="govbb-payment__description">
                Your payment has been received. We've sent a confirmation email
                to the address you provided.
              </p>
            </div>
            <div className="govbb-payment__items">
              {paymentItem("Service:", serviceLabel)}
              {paymentItem("Amount:", formattedAmount)}
              {paymentItem("Date:", formattedDate)}
            </div>
          </section>
        ) : isSafePaymentUrl(paymentUrl) ? (
          <section className="govbb-payment">
            <div className="govbb-payment__header">
              <h2 className="govbb-payment__title">Complete your payment</h2>
              <p className="govbb-payment__description">
                Please review and complete your payment to finalize your
                submission
              </p>
            </div>
            <div className="govbb-payment__items">
              {paymentItem("Service:", serviceLabel)}
              {paymentItem("Unit price:", formattedUnitPrice)}
              {paymentItem("Quantity:", quantity)}
              {paymentItem("Amount:", formattedAmount)}
            </div>
            <a className="govbb-btn" href={paymentUrl}>
              Continue to payment
            </a>
            <p className="govbb-payment__note">
              You will be redirected to EZ Pay to securely complete your
              payment.
            </p>
          </section>
        ) : (
          <section className="govbb-payment govbb-payment--failed">
            <div className="govbb-payment__header">
              <h2 className="govbb-payment__title">
                Unfortunately, your payment was unsuccessful
              </h2>
              <p className="govbb-payment__description">
                Your payment could not be processed. You have not been charged.
              </p>
            </div>
            <button className="govbb-btn--secondary" onClick={onTryAgain}>
              Try again
            </button>
          </section>
        )}

        {(paymentSuccess || isSafePaymentUrl(paymentUrl)) && trailingSections}
      </div>
    </div>
  );
}
