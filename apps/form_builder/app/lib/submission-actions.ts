import { classifyRecipientField } from "@govtech-bb/form-types";

export function submissionActionSummary(
  action: { type: string; config: Record<string, unknown> },
  questionLabels: Record<string, string> = {},
  contactEmail?: string,
) {
  if (action.type === "email") {
    const recipient = action.config.recipientField;
    if (typeof recipient !== "string" || !recipient.trim())
      return {
        title: "Email recipient",
        description: recipient
          ? "Recipient chosen by a rule"
          : "Choose who receives this email",
      };
    switch (classifyRecipientField(recipient)) {
      case "submitted":
        return {
          title: "Email applicant",
          description: questionLabels[recipient]
            ? `To: answer to “${questionLabels[recipient]}”`
            : "To: email address entered in the form",
        };
      case "config":
        return {
          title: "Email department",
          description: "To: department notification email",
        };
      case "contact":
        return {
          title: "Email department",
          description: `To: ${contactEmail || "public contact email"}`,
        };
      case "catchment":
        return {
          title: "Email local office",
          description: "To: office serving the applicant’s area",
        };
      case "literal":
        return { title: "Email recipient", description: `To: ${recipient}` };
    }
  }
  switch (action.type) {
    case "webhook":
      return {
        title: "Send to connected system",
        description: "Send submission data through a webhook",
      };
    case "payment":
      return {
        title: "Collect payment",
        description: "Ask the applicant to pay through EZpay",
      };
    case "spreadsheet":
      return {
        title: "Export to spreadsheet",
        description: "Record the submitted answers",
      };
    case "opencrvs":
      return {
        title: "Send to OpenCRVS",
        description: "Forward the submission to civil registration",
      };
    default:
      return { title: action.type, description: "Runs after submission" };
  }
}
