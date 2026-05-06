import React from "react";
import designSystem from "../styles/govtechbb.module.css";

interface SubmissionConfirmationProps {
  serviceTitle: string;
  stepTitle: string;
  onTryAgain?: () => void;
}

export default function SubmissionConfirmation({
  serviceTitle,
  stepTitle,
  onTryAgain,
}: SubmissionConfirmationProps) {
  // TODO: Dynamically render this content from backend response
  const hasPayment = false;
  const serviceName = "Example Service";
  const amount = "$100.00";
  const quantity = 1;
  const success = true;

  return (
    <div className={designSystem.confirmation}>
      {success ? (
        <>
          <div className={designSystem.successHeader}>
            <p className={designSystem.successServiceTitle}>{serviceTitle}</p>
            <h1 className={designSystem.successStepTitle}>{stepTitle}</h1>
            <p className={designSystem.successSubheading}>
              Your application has been submitted successfully.
            </p>
          </div>

          {hasPayment && (
            <div className={designSystem.paymentSummary}>
              <h2>Complete your payment</h2>
              <p>
                Please review and complete your payment to finalize your
                application
              </p>

              <div className={designSystem.paymentSummaryTable}>
                <p>Service</p>
                <p>{serviceName}</p>
                <p>Quantity</p>
                <p>{quantity}</p>
                <p>Amount</p>
                <p>{amount}</p>
              </div>

              <button data-variant="primary">Continue to payment</button>
              <p className={designSystem.paymentHint}>
                You will be redirected to EZ Pay to securely complete your
                payment.
              </p>
            </div>
          )}

          <div className={designSystem.nextSteps}>
            <h2>What happens next</h2>
            <p>Step 1</p>
            <p>Step 2</p>
            <p>Step 3</p>
          </div>

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
