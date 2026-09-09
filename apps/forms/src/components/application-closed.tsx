import { ContactDetails, formatClosingDateTime } from "@govtech-bb/form-types";
import { Heading, Link, ServiceHeading, Text } from "@govtech-bb/react";

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
    <div className="govbb-width-container govbb-main-wrapper govbb-grid-row">
      <div className="form-page govbb-grid-column-two-thirds-from-desktop">
        <ServiceHeading
          description="The application window has closed."
          className="mb-8"
        >
          Applications for {serviceTitle} have closed
        </ServiceHeading>

        <div className="form-page__closed-panel">
          <p className="form-page__closed-panel-label">Application closed</p>
          <p>{formatClosingDateTime(closingDateTime)}</p>
        </div>

        {hasContact && contactDetails && (
          <div className="form-page__contact">
            <Heading as="h2">Have a question?</Heading>
            <Text className="govbb-text-break-word">
              If you need assistance or have any questions, please contact{" "}
              {contactDetails.title ? `the ${contactDetails.title}` : "us"}
              {contactDetails.email && (
                <>
                  {" "}
                  at{" "}
                  <Link href={`mailto:${contactDetails.email}`}>
                    {contactDetails.email}
                  </Link>
                </>
              )}
              {contactDetails.telephoneNumber && (
                <> or call {contactDetails.telephoneNumber}</>
              )}
              .
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
