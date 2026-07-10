import { Heading, Text } from "@govtech-bb/react";
import { ContactDetails, formatClosingDateTime } from "@govtech-bb/form-types";

interface ApplicationClosedProps {
  serviceTitle: string;
  closingDateTime: string;
  contactDetails?: ContactDetails;
}

/**
 * Shown in place of the form when a recipe's `meta.closingDateTime` has passed
 * (#1936). Mirrors the platform error/closed page layout and sources the MDA
 * contact from the served contract's `contactDetails` (never hardcoded).
 */
export default function ApplicationClosed({
  serviceTitle,
  closingDateTime,
  contactDetails,
}: ApplicationClosedProps) {
  return (
    <div className="container py-8 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2 lg:space-y-8">
          <Heading as="h1">Applications for {serviceTitle} have closed</Heading>
          <Text as="p">The application window has closed.</Text>

          <div className="form-page__contact">
            <p>
              <span className="form-page__contact-label">
                Application closed
              </span>
            </p>
            <p>{formatClosingDateTime(closingDateTime)}</p>
          </div>

          {contactDetails && (
            <div className="form-page__contact">
              <p>If you have a question about this service, contact:</p>
              {contactDetails.title && (
                <h3 className="govbb-text-h3">{contactDetails.title}</h3>
              )}
              <div className="form-page__contact-body">
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
        </div>
      </div>
    </div>
  );
}
