// Generate SQL to insert all 20 youth opportunity forms
const { randomUUID } = require('crypto');

const opportunities = [
  { id: "byac", title: "Barbados YouthADVANCE Corps (BYAC)" },
  { id: "yes", title: "Youth Entrepreneurship Scheme (YES)" },
  { id: "pathways", title: "Pathways Employability Programme" },
  { id: "btu", title: "Block Transformation Unit (BTU)" },
  { id: "national-summer-camp", title: "National Summer Camp Programme" },
  { id: "yar", title: "Youth Achieving Results (YAR)" },
  { id: "cyber-security-training", title: "Cyber Security Training Workshop" },
  { id: "web-design-entrepreneurs", title: "Web Page Design and Maintenance for Entrepreneurs" },
  { id: "bright-sparks-2", title: "Bright Sparks Educational Project 2.0" },
  { id: "bridge-to-future-2025", title: "Bridge to the Future Workshop 2025" },
  { id: "barbados-blooming-libraries", title: "Barbados is Blooming (Little Libraries)" },
  { id: "community-canvas", title: "Community Canvas" },
  { id: "cmc", title: "Centre Management Committees (CMC)" },
  { id: "spreading-joy-2025", title: "Spreading Joy at Christmas 2025" },
  { id: "centre-access", title: "Community Centre Access" },
  { id: "cip", title: "Community Impact Programme (CIP)" },
  { id: "cap", title: "Community Arts Programme (CAP)" },
  { id: "ceep", title: "Community Engagement and Educational Programme (CEEP)" },
  { id: "mission-barbados", title: "Mission Barbados" },
  { id: "ydp", title: "Youth Development Programme" },
];

const parishes = [
  { label: "Christ Church", value: "christ-church" },
  { label: "St. Andrew", value: "st-andrew" },
  { label: "St. George", value: "st-george" },
  { label: "St. James", value: "st-james" },
  { label: "St. John", value: "st-john" },
  { label: "St. Joseph", value: "st-joseph" },
  { label: "St. Lucy", value: "st-lucy" },
  { label: "St. Michael", value: "st-michael" },
  { label: "St. Peter", value: "st-peter" },
  { label: "St. Philip", value: "st-philip" },
  { label: "St. Thomas", value: "st-thomas" },
];

function buildSchema(formId, title) {
  return {
    formId,
    title: `Apply for ${title}`,
    description: `Register your interest in ${title}.`,
    version: "1.0.0",
    createdAt: "2026-05-21T00:00:00Z",
    updatedAt: "2026-05-21T00:00:00Z",
    steps: [
      {
        stepId: "applicant-details",
        title: "About you",
        description: "Tell us who you are so we know how to get in touch.",
        elements: [
          { ref: "components/first-name", overrides: { fieldId: "applicant-first-name", validations: { required: { value: true, error: "First name is required" }, minLength: { value: 2, error: "First name must be at least 2 characters" } } } },
          { ref: "components/last-name", overrides: { fieldId: "applicant-last-name", validations: { required: { value: true, error: "Last name is required" }, minLength: { value: 2, error: "Last name must be at least 2 characters" } } } },
          { ref: "components/date-of-birth", overrides: { fieldId: "applicant-dob", label: "Date of birth", hint: "Used to confirm you meet the age requirements for this opportunity.", validations: { required: { value: true, error: "Date of birth is required" } } } },
          { ref: "components/email", overrides: { fieldId: "applicant-email", validations: { required: { value: true, error: "Email address is required" } } } },
          { ref: "components/telephone", overrides: { fieldId: "applicant-phone", label: "Phone number", hint: "A local Barbados number, for example 246-555-1234.", validations: { required: { value: true, error: "Phone number is required" } } } },
          { ref: "components/parish", overrides: { fieldId: "applicant-parish", options: parishes, validations: { required: { value: true, error: "Select your parish" } } } },
          { ref: "components/generic/radio", overrides: { fieldId: "applicant-citizenship", label: "Citizenship status", options: [ { label: "Barbadian citizen", value: "citizen" }, { label: "Permanent resident", value: "resident" }, { label: "Other", value: "other" } ], validations: { required: { value: true, error: "Select your citizenship status" } } } },
        ],
      },
      {
        stepId: "your-interest",
        title: "About your interest",
        description: `A short paragraph about why ${title} is right for you.`,
        elements: [
          { ref: "components/additional-details", overrides: { fieldId: "interest-motivation", label: "Why are you applying?", hint: "Tell us a bit about what you hope to get out of taking part.", validations: { required: { value: true, error: "Tell us why you're applying" }, minLength: { value: 20, error: "Please write at least 20 characters" } } } },
        ],
      },
      {
        stepId: "declaration",
        title: "Declaration",
        elements: [
          { ref: "components/confirmation", overrides: { fieldId: "declaration-confirmed", label: "Declaration", options: [{ label: "I confirm that my information is correct and I am happy for it to be verified. I understand that false details may lead to my application being rejected, and that the Government of Barbados will keep my information confidential.", value: "confirmed" }], validations: { required: { value: true, error: "You must confirm the declaration to continue" } } } },
          { ref: "components/date-of-birth", overrides: { fieldId: "declaration-date", label: "Date of declaration", isHidden: true } },
        ],
      },
      {
        stepId: "submission-confirmation",
        title: "Application received",
        elements: [],
        nextSteps: [
          { title: "What happens next", content: "The team running this opportunity will review your application. If you meet the eligibility criteria, they will get in touch using the contact details you provided. If we need anything else from you, we will reach out by email or phone. Thank you for your interest." },
        ],
      },
    ],
    processors: [
      { type: "email", config: { recipientField: "applicant-details.applicant-email", subject: `Your application for ${title} has been received` } },
    ],
  };
}

// Generate SQL
const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
const values = opportunities.map((opp) => {
  const schema = buildSchema(`youth-opportunity-${opp.id}`, opp.title);
  const jsonStr = JSON.stringify(schema).replace(/'/g, "''");
  const uuid = randomUUID();
  return `('${uuid}', 'youth-opportunity-${opp.id}', '1.0.0', '${jsonStr}', '${now}', '${now}', '${now}')`;
});

let sql = `-- Seed all 20 youth opportunity forms into form_definitions
-- Run against sandbox DB: modular-forms-db-sandbox
-- Connection: modular-forms-db-sandbox.cl0sug2sklor.ca-central-1.rds.amazonaws.com

INSERT INTO form_definitions (id, form_id, version, schema, published_at, created_at, updated_at) VALUES
${values.join(',\n')};
`;

console.log(sql);
