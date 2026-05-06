import React from "react";
import designSystem from "../styles/govtechbb.module.css";

export default function SubmissionConfirmation() {
  const hasPayment = true; // TODO: get this from backend response
  const serviceName = "Example Service"; // TODO: get this from backend response
  const amount = "$100.00"; // TODO: get this from backend response
  const quantity = 1; // TODO: get this from backend response

  return (
    <div className={designSystem.confirmation}>
      <p className={designSystem.subHeading}>
        The department will process your application when you have made your
        payment.
      </p>

      {hasPayment && (
        <div className={designSystem.paymentSummary}>
          <h2>Complete your payment</h2>
          <p>
            Please review and complete your payment to finalize your application
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
            You will be redirected to EZ Pay to securely complete your payment.
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
          We are always working to improve government services. If you have a
          moment, you can tell us about your experience today.
        </p>
        <button data-variant="secondary">Give feedback on this service</button>

        <p>This will take about 30 seconds. Your responses are anonymous.</p>
      </div>
    </div>
  );
}
