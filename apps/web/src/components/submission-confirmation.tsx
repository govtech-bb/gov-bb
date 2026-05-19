import React from "react";
import designSystem from "../styles/govtechbb.module.css";
import { SubmissionConfirmationProps } from "../types/props.type";

export default function SubmissionConfirmation({
  serviceTitle,
  stepTitle,
  nextSteps,
  contactDetails,
  onTryAgain,
  submissionState,
}: SubmissionConfirmationProps) {
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
  } = submissionState ?? {
    hasPayment: true,
    serviceName: "Example Service",
    amount: "$100.00",
    quantity: 1,
    submissionSuccess: true,
    paymentSuccess: true,
    referenceNumber: "ABC123456789",
    date: "07/05/2026",
    paymentDescription: undefined,
    paymentId: undefined,
    paymentUrl: undefined,
  };

  return (
    <div className={designSystem.confirmation}>
      {submissionSuccess ? (
        <>
          {hasPayment ? (
            paymentSuccess ? (
              <div>
                <div className={designSystem.successHeader}>
                  <p className={designSystem.successServiceTitle}>
                    {serviceTitle}
                  </p>
                  <h1 className={designSystem.successStepTitle}>{stepTitle}</h1>
                  <p className={designSystem.successSubheading}>
                    Your submission has been saved
                  </p>
                </div>

                <div className={designSystem.paymentSuccessSummary}>
                  <h2>Your payment was successful</h2>
                  <p>
                    Your payment has been received. We've sent a confirmation
                    email to the address you provided.
                  </p>
                  <div className={designSystem.paymentSummaryTable}>
                    <p>Service</p>
                    <p>{serviceName}</p>
                    <p>Amount</p>
                    <p>{amount}</p>
                    <p>Reference Number</p>
                    <p>{referenceNumber}</p>
                    <p>Date</p>
                    <p>{date}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div>
                  <p className={designSystem.formTitle}>{serviceTitle}</p>
                  <h1>{stepTitle}</h1>
                  <p>Complete your payment below to finalize your submission</p>
                </div>
                <div className={designSystem.paymentSummary}>
                  <h2>Complete your payment</h2>
                  <p>
                    Please review and complete your payment to finalize your
                    application{" "}
                    {paymentDescription ? `for ${paymentDescription}.` : "."}
                  </p>

                  <div className={designSystem.paymentSummaryTable}>
                    <p>Service</p>
                    <p>{serviceName}</p>
                    <p>Quantity</p>
                    <p>{quantity}</p>
                    <p>Amount</p>
                    <p>{amount}</p>
                  </div>

                  <a href={paymentUrl}>
                    <button data-variant="primary">Continue to payment</button>
                  </a>
                  <p className={designSystem.paymentHint}>
                    You will be redirected to EZ Pay to securely complete your
                    payment.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div>
              <div className={designSystem.successHeader}>
                <p className={designSystem.successServiceTitle}>
                  {serviceTitle}
                </p>
                <h1 className={designSystem.successStepTitle}>{stepTitle}</h1>
                <p className={designSystem.successSubheading}>
                  Your submission has been saved
                </p>
              </div>
              {referenceNumber && (
                <div className={designSystem.paymentSummaryTable}>
                  <p>Reference Number</p>
                  <p>{referenceNumber}</p>
                </div>
              )}
            </div>
          )}

          {nextSteps && nextSteps.length > 0 && (
            <div className={designSystem.nextSteps}>
              {nextSteps.map((section, index) => (
                <div key={index}>
                  <h2>{section.title}</h2>
                  {section.content && <p>{section.content}</p>}
                  {section.items && section.items.length > 0 && (
                    <ul>
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
            <div className={designSystem.contactDetails}>
              <p>If you need help with your application, contact:</p>
              <h3>{contactDetails.title}</h3>
              <div className={designSystem.contactDetailsBody}>
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
                  <span className={designSystem.contactLabel}>Telephone:</span>{" "}
                  {contactDetails.telephoneNumber}
                </p>
                <p>
                  <span className={designSystem.contactLabel}>Email:</span>{" "}
                  {contactDetails.email}
                </p>
              </div>
            </div>
          )}

          <div className={designSystem.feedback}>
            <h3>Help us improve this service</h3>
            <p>
              We are always working to improve government services. If you have
              a moment, you can tell us about your experience today.
            </p>
            <button data-variant="secondary">
              Give feedback on this service
            </button>
            <p>
              This will take about 30 seconds. Your responses are anonymous.
            </p>
          </div>
        </>
      ) : (
        <div>
          <div className={designSystem.errorHeader}>
            <p className={designSystem.errorServiceTitle}>{serviceTitle}</p>
            <h1 className={designSystem.errorStepTitle}>Error</h1>
            <p className={designSystem.errorSubheading}>
              More error details go here.
            </p>
          </div>

          <button data-variant="primary" onClick={onTryAgain}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
