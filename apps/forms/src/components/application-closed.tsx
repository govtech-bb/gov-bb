import { ContactDetails, formatClosingDateTime } from "@govtech-bb/form-types";

interface ApplicationClosedProps {
  serviceTitle: string;
  closingDateTime: string;
  contactDetails?: ContactDetails;
}

/**
 * Shown in place of the form when a recipe's `meta.closingDateTime` has passed
 * (#1936). Uses the same form-page chrome as the renderer and sources the MDA
 * contact from the served contract's `contactDetails` (never hardcoded).
 */
export default function ApplicationClosed({
  serviceTitle,
  closingDateTime,
  contactDetails,
}: ApplicationClosedProps) {
  const hasContact = Boolean(
    contactDetails?.title ||
    contactDetails?.email ||
    contactDetails?.telephoneNumber,
  );

  return (
    <div className="container pb-8 lg:pb-16">
      <div className="form-page form-width">
        <div className="form-page__header">
          <h1 className="govbb-text-h1">
            Applications for {serviceTitle} have closed
          </h1>
          <p className="form-page__step-description">
            The application window has closed.
          </p>
        </div>

        <div className="form-page__closed-panel">
          <p className="form-page__closed-panel-label">Application closed</p>
          <p>{formatClosingDateTime(closingDateTime)}</p>
        </div>

        {hasContact && contactDetails && (
          <div className="form-page__contact">
            <h2 className="govbb-text-h2">Have a question?</h2>
            <p>
              If you need assistance or have any questions, please contact{" "}
              {contactDetails.title ? `the ${contactDetails.title}` : "us"}
              {contactDetails.email && (
                <>
                  {" "}
                  at{" "}
                  <a
                    className="govbb-link"
                    href={`mailto:${contactDetails.email}`}
                  >
                    {contactDetails.email}
                  </a>
                </>
              )}
              {contactDetails.telephoneNumber && (
                <> or call {contactDetails.telephoneNumber}</>
              )}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
