import React from "react";
import { isSafePaymentUrl } from "../lib/security/safe-payment-url";
import { SubmissionConfirmationProps } from "../types/props.type";

export default function SubmissionConfirmation({
  serviceTitle,
  stepTitle,
  nextSteps,
  contactDetails,
  onTryAgain,
  submissionState,
}: SubmissionConfirmationProps) {
  // Without a committed submissionState there is nothing genuine to confirm.
  // The form-renderer redirects away from this step when state is absent, so
  // rendering null here avoids ever fabricating a fake payment receipt.
  if (!submissionState) {
    return null;
  }

  const {
    hasPayment,
    serviceName,
    amount,
    quantity,
    submissionSuccess,
    paymentSuccess,
    referenceNumber,
    date,
    paymentUrl,
    paymentId,
    paymentDescription,
    displayStatus: displayStatusProp,
    errorMessage,
  } = submissionState;

  const displayStatus =
    displayStatusProp ?? (submissionSuccess ? "success" : "error");

  return (
    <div className="form-page__confirmation">
      {displayStatus === "success" ? (
        <>
          {hasPayment ? (
            paymentSuccess ? (
              <div>
                <div className="form-page__panel form-page__panel--success">
                  <p className="form-page__panel-service-title">
                    {serviceTitle}
                  </p>
                  <h1 className="govbb-text-h1">{stepTitle}</h1>
                  <p className="form-page__panel-subheading">
                    Your submission has been saved
                  </p>
                </div>

                <div className="form-page__payment form-page__payment--success">
                  <h2 className="govbb-text-h2">Your payment was successful</h2>
                  <p>
                    Your payment has been received. We've sent a confirmation
                    email to the address you provided.
                  </p>
                  <dl className="form-page__payment-table">
                    <dt>Service</dt>
                    <dd>{serviceName}</dd>
                    <dt>Amount</dt>
                    <dd>{amount}</dd>
                    <dt>Reference Number</dt>
                    <dd>{referenceNumber}</dd>
                    <dt>Date</dt>
                    <dd>{date}</dd>
                  </dl>
                </div>
              </div>
            ) : isSafePaymentUrl(paymentUrl) ? (
              <div>
                <div>
                  <p className="form-page__service-title">{serviceTitle}</p>
                  <h1 className="govbb-text-h1">{stepTitle}</h1>
                  <p>Complete your payment below to finalize your submission</p>
                </div>
                <div className="form-page__payment">
                  <h2 className="govbb-text-h2">Complete your payment</h2>
                  <p>
                    Please review and complete your payment to finalize your
                    application{" "}
                    {paymentDescription ? `for ${paymentDescription}.` : "."}
                  </p>

                  <dl className="form-page__payment-table">
                    <dt>Service</dt>
                    <dd>{serviceName}</dd>
                    <dt>Quantity</dt>
                    <dd>{quantity}</dd>
                    <dt>Amount</dt>
                    <dd>{amount}</dd>
                  </dl>

                  <a href={paymentUrl}>
                    <button className="govbb-btn">Continue to payment</button>
                  </a>
                  <p className="form-page__payment-hint">
                    You will be redirected to EZ Pay to securely complete your
                    payment.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="form-page__panel form-page__panel--error">
                  <p className="form-page__panel-service-title">
                    {serviceTitle}
                  </p>
                  <h1 className="govbb-text-h1">
                    Payment could not be initiated
                  </h1>
                  <p className="form-page__panel-subheading">
                    Your submission was saved, but we were unable to start the
                    payment securely. Please contact support and quote your
                    reference number.
                  </p>
                </div>
                {referenceNumber && (
                  <div className="form-page__payment-table">
                    <p>Reference Number</p>
                    <p>{referenceNumber}</p>
                  </div>
                )}
              </div>
            )
          ) : (
            <div>
              <div className="form-page__panel form-page__panel--success">
                <p className="form-page__panel-service-title">{serviceTitle}</p>
                <h1 className="govbb-text-h1">{stepTitle}</h1>
                <p className="form-page__panel-subheading">
                  Your submission has been saved
                </p>
              </div>
              {referenceNumber && (
                <dl className="form-page__payment-table">
                  <dt>Reference Number</dt>
                  <dd>{referenceNumber}</dd>
                </dl>
              )}
            </div>
          )}

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

          {contactDetails && (
            <div className="form-page__contact">
              <p>If you need help with your application, contact:</p>
              <h3 className="govbb-text-h3">{contactDetails.title}</h3>
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
                <p>
                  <span className="form-page__contact-label">Telephone:</span>{" "}
                  {contactDetails.telephoneNumber}
                </p>
                <p>
                  <span className="form-page__contact-label">Email:</span>{" "}
                  {contactDetails.email}
                </p>
              </div>
            </div>
          )}

          <div className="form-page__feedback">
            <h3 className="govbb-text-h3">Help us improve this service</h3>
            <p>
              We are always working to improve government services. If you have
              a moment, you can tell us about your experience today.
            </p>
            <button className="govbb-btn--secondary">
              Give feedback on this service
            </button>
            <p>
              This will take about 30 seconds. Your responses are anonymous.
            </p>
          </div>
        </>
      ) : displayStatus === "processing" ? (
        <div>
          <div className="form-page__panel form-page__panel--processing">
            <p className="form-page__panel-service-title">{serviceTitle}</p>
            <h1 className="govbb-text-h1">
              We're still processing your submission
            </h1>
            <p className="form-page__panel-subheading">
              Your submission has been received and is being processed. We'll
              email you once it's complete — you can safely close this page.
            </p>
          </div>
          {referenceNumber && (
            <dl className="form-page__payment-table">
              <dt>Reference Number</dt>
              <dd>{referenceNumber}</dd>
            </dl>
          )}
        </div>
      ) : (
        <div>
          <div className="form-page__panel form-page__panel--error">
            <p className="form-page__panel-service-title">{serviceTitle}</p>
            <h1 className="govbb-text-h1">Something went wrong</h1>
            <p className="form-page__panel-subheading">
              {errorMessage ??
                "We couldn't complete your submission. Please try again."}
            </p>
          </div>
          {referenceNumber && (
            <dl className="form-page__payment-table">
              <dt>Reference Number</dt>
              <dd>{referenceNumber}</dd>
            </dl>
          )}
          <button className="govbb-btn" onClick={onTryAgain}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
