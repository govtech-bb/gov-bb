import type { FormPage, LegacySsbFormSchema as FormSchema } from "./schema";
import { checkId } from "../../core/identities";
import {
  closingWorks,
  CONTACT_EMAIL,
  MDA_EMAIL,
  APPLICANT_LABEL,
  DEPARTMENT_LABEL,
  FORM_SETTINGS,
  VISIBILITY_VALUES,
  EMAIL_PATTERN,
  autoFormId,
  contactOut,
  type FormSettings,
  type ServiceContract,
  type EmailProcessor,
} from "../../core/form-settings";

export function answerPath(pages: FormPage[], key: string) {
  for (const page of pages) {
    const question = page.blocks.find((block) => block.type === "question" && block.id === key);

    if (question?.type === "question") return `${page.stepId}.${question.fieldId}`;
  }
}

export function serviceContract(
  settings: FormSettings,
  title: string,
  pages: FormPage[],
): ServiceContract {
  const contactDetails = contactOut(settings.contactDetails);
  const processors: EmailProcessor[] = [];

  const add = (recipientField: string, subject: string | undefined, label: string) =>
    processors.push({
      type: "email",
      config: { recipientField, ...(subject?.trim() && { subject: subject.trim() }), label },
    });

  if (settings.applicantEmail)
    add(
      answerPath(pages, settings.applicantEmail.question) ?? "",
      settings.applicantEmail.subject,
      APPLICANT_LABEL,
    );

  if (!settings.departmentEmail?.off)
    add(
      settings.departmentEmail?.to ?? MDA_EMAIL,
      settings.departmentEmail?.subject,
      DEPARTMENT_LABEL,
    );

  return {
    formId: settings.formId ?? autoFormId(title),
    ...(settings.description?.trim() && { description: settings.description.trim() }),
    ...(contactDetails && { contactDetails }),
    processors,
    meta: {
      visibility: settings.visibility ?? "preview",
      ...(settings.closingDateTime && { closingDateTime: settings.closingDateTime }),
    },
  };
}

export function formSettingsIssues(schema: FormSchema) {
  const issues: { code: string; message: string; where: string }[] = [];

  const add = (code: string, message: string) =>
    issues.push({ code, message, where: FORM_SETTINGS });

  const idError = checkId(schema.formId, new Set());

  if (idError) add("form-id", idError);

  if (!VISIBILITY_VALUES.includes(schema.meta.visibility))
    add("visibility", "Choose who can use the form");

  if (schema.meta.closingDateTime && !closingWorks(schema.meta.closingDateTime))
    add("closing-date", "Enter the closing date as a date and a time");
  const contact = schema.contactDetails;

  if (contact?.email && !EMAIL_PATTERN.test(contact.email))
    add(
      "contact-email",
      "Enter the contact email address in the correct format, like name@example.com",
    );

  if (contact?.address && (!contact.address.line1.trim() || !contact.address.city.trim()))
    add("contact-address", "Enter address line 1 and the town or city, or clear the address");
  const emails = schema.processors.filter((processor) => processor.type === "email");

  if (!emails.length)
    add("no-email", "Turn on at least one email: SSB needs every form to send one");

  if (emails.some(({ config }) => config.recipientField === CONTACT_EMAIL) && !contact?.email)
    add(
      "contact-recipient",
      "Add a contact email, or send the department’s email to its notification address",
    );

  for (const {
    config: { recipientField: path },
  } of emails) {
    if (path.includes("@") || /^(config|contactDetails|catchment)\./.test(path)) continue;
    const dot = path.indexOf(".");
    const page = schema.pages.find((page) => page.stepId === path.slice(0, dot));

    const question = page?.blocks.find(
      (block) => block.type === "question" && block.fieldId === path.slice(dot + 1),
    );

    if (!path || dot < 0 || !question || question.type !== "question")
      add("email-recipient", "Choose the email question that gets the applicant’s email");
    else if (question.kind !== "email")
      add("email-recipient", "The applicant’s email must go to an email address question");
    else if (
      page?.behaviours?.some((value) => value.type === "repeatable") ||
      question.behaviours?.some((value) => value.type === "fieldArray")
    )
      add(
        "email-recipient",
        "The applicant’s email can’t go to a question people answer more than once",
      );
  }

  return issues;
}
