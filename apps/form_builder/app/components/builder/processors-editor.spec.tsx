import { respondToConfirmation } from "../../test/ui";
import { openSelect, chooseOption } from "../../test/select";
/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "../../test/ui";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { RecipeDraft, ResolvedFieldId } from "@govtech-bb/form-builder";
import { recipeReducer } from "./recipe-reducer";
import { ProcessorsEditor } from "./processors-editor";

// jsdom doesn't always provide crypto.randomUUID, which ADD_PROCESSOR relies on.
beforeAll(() => {
  if (!globalThis.crypto?.randomUUID) {
    let n = 0;
    Object.defineProperty(globalThis, "crypto", {
      value: { ...globalThis.crypto, randomUUID: () => `test-id-${++n}` },
      configurable: true,
    });
  }
});

const FIELDS: ResolvedFieldId[] = [
  {
    fieldId: "email",
    editorFieldId: "e1",
    stepId: "contact",
    stepTitle: "Contact",
    display: "Email",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "full-name",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Full name",
    isBoolean: false,
    isNumeric: false,
  },
];

const emptyDraft: RecipeDraft = { formId: "f", title: "T", steps: [] };

function Harness({
  initial,
  fields = FIELDS,
}: {
  initial: RecipeDraft;
  fields?: ResolvedFieldId[];
}) {
  const [draft, dispatch] = useReducer(recipeReducer, initial);
  return (
    <>
      <ProcessorsEditor draft={draft} dispatch={dispatch} fields={fields} />
      <pre data-testid="state">{JSON.stringify(draft.processors ?? [])}</pre>
    </>
  );
}

function state(): Array<{ type: string; config: Record<string, unknown> }> {
  return JSON.parse(screen.getByTestId("state").textContent || "[]");
}

async function addProcessor(type: string) {
  await chooseOption(
    screen.getByLabelText(/^action$/i),
    (
      {
        email: "Email confirmation",
        "webhook-cams": "Case Management System (CaMS)",
        webhook: "Webhook (custom URL)",
        payment: "Payment",
        spreadsheet: "Spreadsheet export",
        opencrvs: "OpenCRVS forward",
      } as Record<string, string>
    )[type],
  );
  await userEvent.click(screen.getByRole("button", { name: /add action/i }));
}

beforeEach(() => {});
afterEach(() => {
  vi.restoreAllMocks();
});

it("adds a processor of each authorable type", async () => {
  render(<Harness initial={emptyDraft} />);
  for (const type of [
    "email",
    "webhook-cams",
    "webhook",
    "payment",
    "spreadsheet",
    "opencrvs",
  ]) {
    await addProcessor(type);
  }
  expect(state().map((p) => p.type)).toEqual([
    "email",
    "webhook",
    "webhook",
    "payment",
    "spreadsheet",
    "opencrvs",
  ]);
  // The CaMS preset lands as a mapped webhook; the custom one keeps its url.
  expect(state()[1].config).toHaveProperty("mapping");
  expect(state()[1].config).not.toHaveProperty("url");
  expect(state()[2].config).toHaveProperty("url");
  expect(state()[2].config).not.toHaveProperty("mapping");
  // Six sequential render+user-event cycles run slower under Vitest than the
  // 5s default allows on a loaded CI runner (~1s locally); give it headroom.
}, 15000);

it("offers payment as an addable type (#716)", async () => {
  render(<Harness initial={emptyDraft} />);
  const select = screen.getByLabelText(/^action$/i);
  expect(
    within(await openSelect(select)).queryByText(/payment/i),
  ).toBeInTheDocument();
});

it("populates the recipient-field picker with only email-like fields", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  // The email field is offered...
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Email (contact.email)",
    }),
  ).toBeInTheDocument();
  // ...but a non-email field (full-name) is filtered out.
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Full name/,
    }),
  ).not.toBeInTheDocument();
});

it("offers every email-like field (incl. mixed-case and applicant-email) and excludes the rest", async () => {
  const fields: ResolvedFieldId[] = [
    {
      fieldId: "email",
      editorFieldId: "e1",
      stepId: "contact",
      stepTitle: "Contact",
      display: "Email",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "applicant-email",
      editorFieldId: "e2",
      stepId: "applicant",
      stepTitle: "Applicant",
      display: "Applicant email",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "Email", // mixed-case id
      editorFieldId: "e3",
      stepId: "mda",
      stepTitle: "MDA",
      display: "MDA contact",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "full-name", // not email-like
      editorFieldId: "e4",
      stepId: "applicant",
      stepTitle: "Applicant",
      display: "Full name",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "dob", // not email-like
      editorFieldId: "e5",
      stepId: "applicant",
      stepTitle: "Applicant",
      display: "Date of birth",
      isBoolean: false,
      isNumeric: false,
    },
  ];
  render(<Harness initial={emptyDraft} fields={fields} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(
    within(await openSelect(picker)).getByRole("option", { name: /^Email/ }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: /Applicant email/,
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: /MDA contact/,
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Full name/,
    }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Date of birth/,
    }),
  ).not.toBeInTheDocument();
});

it("shows only the placeholder and the always-on config.mdaEmail option when no field is email-like", async () => {
  const fields: ResolvedFieldId[] = [
    {
      fieldId: "full-name",
      editorFieldId: "e1",
      stepId: "applicant",
      stepTitle: "Applicant",
      display: "Full name",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "dob",
      editorFieldId: "e2",
      stepId: "applicant",
      stepTitle: "Applicant",
      display: "Date of birth",
      isBoolean: false,
      isNumeric: false,
    },
  ];
  render(<Harness initial={emptyDraft} fields={fields} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  const options = within(await openSelect(picker)).getAllByRole("option");
  // Placeholder + the always-on config.mdaEmail option (issue #607); no
  // email-like form field is offered.
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent(/select field/i);
  expect(options[1]).toHaveTextContent("config.mdaEmail");
});

it("offers the MDA contact email as a recipient option when the draft has contact details", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    contactDetails: {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
    },
  };
  render(<Harness initial={initial} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "MDA contact email (contactDetails.email)",
    }),
  ).toBeInTheDocument();
});

it("does not offer the MDA contact email option when the draft has no contact details", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /MDA contact email/,
    }),
  ).not.toBeInTheDocument();
});

it("does not offer the MDA contact email option when contactDetails has no email (issue #607)", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    // A contactDetails object that exists but carries no email — the gate must
    // be on the email being present, not just the object existing.
    contactDetails: { title: "Ministry of Health" },
  };
  render(<Harness initial={initial} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /MDA contact email/,
    }),
  ).not.toBeInTheDocument();
});

it("always offers config.mdaEmail (per-environment) as a recipient option (issue #607)", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "MDA notification email (per-environment) (config.mdaEmail)",
    }),
  ).toBeInTheDocument();
});

it("selects config.mdaEmail as the recipient path (issue #607)", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  await chooseOption(
    screen.getByLabelText(/recipient field/i),
    new RegExp("\\(config\\.mdaEmail\\)$"),
  );
  expect(state()[0].config.recipientField).toBe("config.mdaEmail");
});

it("selects the MDA contact email as the recipient path", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    contactDetails: {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
    },
  };
  render(<Harness initial={initial} />);
  await addProcessor("email");
  await chooseOption(
    screen.getByLabelText(/recipient field/i),
    new RegExp("\\(contactDetails\\.email\\)$"),
  );
  expect(state()[0].config.recipientField).toBe("contactDetails.email");
});

it("edits an email processor's recipient path", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  await chooseOption(
    screen.getByLabelText(/recipient field/i),
    new RegExp("\\(contact\\.email\\)$"),
  );
  expect(state()[0].config.recipientField).toBe("contact.email");
});

it("removes a processor", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("webhook");
  expect(state()).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
  await respondToConfirmation("Remove action");
  expect(state()).toHaveLength(0);
});

// #2877: a catchment-routed form needs a mapped webhook or the API refuses it.
// The editor warns but still lets the author remove it — Deploy is the gate.
it("warns when a catchment-routed form loses its mapped webhook, and still allows Remove", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    catchmentRouting: {
      coordinatesField: "about.coordinates",
      parishField: "about.parish",
    },
    processors: [
      {
        id: "wh-1",
        type: "webhook",
        config: {
          method: "POST",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10000,
          mapping: {
            programmeCode: "RESTAURANT_LICENCE",
            applicant: {
              name: "applicant.full-name",
              email: "contact.email",
              phone: "contact.phone",
            },
            excludeSteps: [],
            groupByStep: false,
          },
        },
      },
    ],
  };
  render(<Harness initial={initial} />);
  expect(screen.queryByText(/routes by catchment/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
  await respondToConfirmation("Remove action");
  expect(state()).toHaveLength(0);
  expect(screen.getByText(/routes by catchment/i)).toHaveTextContent(
    /cannot be deployed/i,
  );
});

it("does not show the catchment warning on a form without catchment routing", () => {
  render(<Harness initial={emptyDraft} />);
  expect(screen.queryByText(/routes by catchment/i)).not.toBeInTheDocument();
});

it("only clears the applicant warning after an applicant recipient is selected", async () => {
  render(<Harness initial={emptyDraft} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/email/i);
  await addProcessor("email");
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await chooseOption(
    screen.getByLabelText(/recipient field/i),
    /config\.mdaEmail/,
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await chooseOption(
    screen.getByLabelText(/recipient field/i),
    "Email (contact.email)",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("preserves a pre-existing webhook secret when editing the url", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "wh-1",
        type: "webhook",
        config: {
          url: "https://old.example.gov.bb/hook",
          method: "POST",
          secret: "supersecretkey1234",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10000,
        },
      },
    ],
  };
  render(<Harness initial={initial} />);
  const urlInput = screen.getByLabelText(/^url$/i);
  await userEvent.clear(urlInput);
  await userEvent.type(urlInput, "https://new.example.gov.bb/hook");
  expect(state()[0].config.url).toBe("https://new.example.gov.bb/hook");
  expect(state()[0].config.secret).toBe("supersecretkey1234");
});

it("prunes the webhook headers key when the last header is removed", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "wh-1",
        type: "webhook",
        config: {
          url: "https://example.gov.bb/hook",
          method: "POST",
          headers: { "X-Source": "gov-bb" },
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10000,
        },
      },
    ],
  };
  render(<Harness initial={initial} />);
  await userEvent.click(screen.getByRole("button", { name: /remove row/i }));
  expect(state()[0].config).not.toHaveProperty("headers");
});

it("preserves email labels alongside recipient descriptions", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "em-1",
        type: "email",
        config: { recipientField: "", label: "Applicant Email" },
      },
      {
        id: "em-2",
        type: "email",
        config: { recipientField: "contactDetails.email", label: "MDA Email" },
      },
    ],
  };
  render(<Harness initial={initial} />);
  expect(screen.getByText("Applicant Email")).toBeInTheDocument();
  expect(screen.getByText("MDA Email")).toBeInTheDocument();
});

it("shows that a new email needs a recipient", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  expect(
    screen.getByText("Email recipient", { selector: "strong" }),
  ).toBeInTheDocument();
});

it("edits an email processor's label", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  await userEvent.type(screen.getByLabelText(/^label$/i), "MDA Email");
  expect(state()[0].config.label).toBe("MDA Email");
});

it("prunes the label key when cleared", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "em-1",
        type: "email",
        config: { recipientField: "", label: "MDA Email" },
      },
    ],
  };
  render(<Harness initial={initial} />);
  await userEvent.clear(screen.getByLabelText(/^label$/i));
  expect(state()[0].config).not.toHaveProperty("label");
});

it("renders an existing payment processor as an editable form (#716)", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "pay-1",
        type: "payment",
        config: {
          provider: "ezpay",
          department: "Treasury",
          paymentCode: "FEE-001",
          amount: 50,
          description: "Fee",
          customerEmailPath: "contact.email",
          customerNamePath: "applicant.full-name",
        },
      },
    ],
  };
  render(<Harness initial={initial} />);
  // No read-only note now — the config is editable.
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
  // Editable inputs are present and pre-populated from the config.
  expect(screen.getByLabelText(/department/i)).toHaveValue("Treasury");
  expect(screen.getByLabelText(/payment code/i)).toHaveValue("FEE-001");
  // Exact label: a literal amount opens in Fixed mode (there's also an
  // "Amount type" toggle now — see -amount-editor).
  expect(screen.getByLabelText("Amount")).toHaveValue(50);
  expect(screen.getByLabelText("Amount type")).toHaveTextContent(
    "Fixed amount",
  );
  // Provider is fixed (ezpay) and not user-editable.
  expect(screen.getByLabelText(/provider/i)).toBeDisabled();
});

it("edits a payment processor's department field in place (#716)", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "pay-1",
        type: "payment",
        config: {
          provider: "ezpay",
          department: "Treasury",
          paymentCode: "FEE-001",
          amount: 50,
          description: "Fee",
          customerEmailPath: "contact.email",
          customerNamePath: "applicant.full-name",
        },
      },
    ],
  };
  render(<Harness initial={initial} />);
  const dept = screen.getByLabelText(/department/i);
  await userEvent.clear(dept);
  await userEvent.type(dept, "Registry");
  expect(state()[0].config.department).toBe("Registry");
});

// ── Payment customer email/name path filtering (#957) ────────────────────────
// The payment processor's customer email/name path pickers must only offer
// fields whose label OR id implies email / name — picking a mismatched field
// yields a payment that sends garbage to ezpay. Matching is on label OR id
// (broader than the email processor's id-only recipient filter).

const PAYMENT_FILTER_FIELDS: ResolvedFieldId[] = [
  // email-like
  {
    fieldId: "email",
    editorFieldId: "e1",
    stepId: "s",
    stepTitle: "S",
    display: "Email",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "q1",
    editorFieldId: "e2",
    stepId: "s",
    stepTitle: "S",
    display: "Email address",
    isBoolean: false,
    isNumeric: false,
  }, // by label only
  {
    fieldId: "applicant-email",
    editorFieldId: "e3",
    stepId: "s",
    stepTitle: "S",
    display: "Contact",
    isBoolean: false,
    isNumeric: false,
  }, // by id only
  // name-like
  {
    fieldId: "full-name",
    editorFieldId: "e4",
    stepId: "s",
    stepTitle: "S",
    display: "Full name",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "q2",
    editorFieldId: "e5",
    stepId: "s",
    stepTitle: "S",
    display: "Your name",
    isBoolean: false,
    isNumeric: false,
  }, // by label only
  {
    fieldId: "business-name",
    editorFieldId: "e6",
    stepId: "s",
    stepTitle: "S",
    display: "Business",
    isBoolean: false,
    isNumeric: false,
  }, // by id only
  // neither
  {
    fieldId: "phone",
    editorFieldId: "e7",
    stepId: "s",
    stepTitle: "S",
    display: "Phone",
    isBoolean: false,
    isNumeric: false,
  },
];

it("offers only email-like fields (by label or id) in the customer email path picker (#957)", async () => {
  render(<Harness initial={emptyDraft} fields={PAYMENT_FILTER_FIELDS} />);
  await addProcessor("payment");
  const picker = screen.getByLabelText(/customer email path/i);
  // email-like fields are offered, whether matched by label or id
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Email (s.email)",
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: /Email address/,
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Contact (s.applicant-email)",
    }),
  ).toBeInTheDocument();
  // name/other fields are filtered out
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Full name/,
    }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Your name/,
    }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", {
      name: /Business/,
    }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Phone/ }),
  ).not.toBeInTheDocument();
});

it("offers only name-like fields (by label or id) in the customer name path picker (#957)", async () => {
  render(<Harness initial={emptyDraft} fields={PAYMENT_FILTER_FIELDS} />);
  await addProcessor("payment");
  const picker = screen.getByLabelText(/customer name path/i);
  // name-like fields are offered, whether matched by label or id
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Full name (s.full-name)",
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", { name: /Your name/ }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Business (s.business-name)",
    }),
  ).toBeInTheDocument();
  // email/other fields are filtered out
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Email/ }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Contact/ }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Phone/ }),
  ).not.toBeInTheDocument();
});

it("filters the customer email/name pickers case-insensitively (#957)", async () => {
  const fields: ResolvedFieldId[] = [
    {
      fieldId: "Email",
      editorFieldId: "e1",
      stepId: "s",
      stepTitle: "S",
      display: "MDA contact",
      isBoolean: false,
      isNumeric: false,
    },
    {
      fieldId: "applicant-NAME",
      editorFieldId: "e2",
      stepId: "s",
      stepTitle: "S",
      display: "Applicant",
      isBoolean: false,
      isNumeric: false,
    },
  ];
  render(<Harness initial={emptyDraft} fields={fields} />);
  await addProcessor("payment");
  expect(
    within(
      await openSelect(screen.getByLabelText(/customer email path/i)),
    ).getByRole("option", {
      name: /MDA contact/,
    }),
  ).toBeInTheDocument();
  expect(
    within(
      await openSelect(screen.getByLabelText(/customer name path/i)),
    ).getByRole("option", {
      name: /Applicant/,
    }),
  ).toBeInTheDocument();
});

it("preserves a previously-saved out-of-list customer email path via the (current) fallback (#957)", async () => {
  const initial: RecipeDraft = {
    formId: "f",
    title: "T",
    steps: [],
    processors: [
      {
        id: "pay-1",
        type: "payment",
        config: {
          provider: "ezpay",
          department: "Treasury",
          paymentCode: "FEE-001",
          amount: 50,
          description: "Fee",
          // A path that is NOT email-like — must still render so it isn't dropped.
          customerEmailPath: "s.phone",
          customerNamePath: "",
        },
      },
    ],
  };
  render(<Harness initial={initial} fields={PAYMENT_FILTER_FIELDS} />);
  const picker = screen.getByLabelText(/customer email path/i);
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "s.phone (current)",
    }),
  ).toBeInTheDocument();
});

// ── Age-band condition: date-of-birth-only field options (#959) ───────────────
// In a conditional (age-band) amount, when a rule compares the "Age of field",
// the condition-field picker must only offer date-of-birth fields. Comparing a
// field's value (subject = "field") stays unrestricted.

const AGE_FILTER_FIELDS: ResolvedFieldId[] = [
  {
    fieldId: "date-of-birth",
    editorFieldId: "e1",
    stepId: "s",
    stepTitle: "S",
    display: "Date of birth",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "dob",
    editorFieldId: "e2",
    stepId: "s",
    stepTitle: "S",
    display: "Applicant",
    isBoolean: false,
    isNumeric: false,
  }, // by id (dob)
  {
    fieldId: "q1",
    editorFieldId: "e3",
    stepId: "s",
    stepTitle: "S",
    display: "Birth date",
    isBoolean: false,
    isNumeric: false,
  }, // by label (birth)
  {
    fieldId: "email",
    editorFieldId: "e4",
    stepId: "s",
    stepTitle: "S",
    display: "Email",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "phone",
    editorFieldId: "e5",
    stepId: "s",
    stepTitle: "S",
    display: "Phone",
    isBoolean: false,
    isNumeric: false,
  },
];

async function addConditionalRule() {
  await addProcessor("payment");
  await chooseOption(
    screen.getByLabelText(/amount type/i),
    "Conditional amount",
  );
  await userEvent.click(screen.getByRole("button", { name: /add rule/i }));
}

it("offers all fields in the condition-field picker when comparing a field value (#959)", async () => {
  render(<Harness initial={emptyDraft} fields={AGE_FILTER_FIELDS} />);
  await addConditionalRule();
  // subject defaults to "field" — every field is selectable
  const picker = screen.getByLabelText(/condition field/i);
  expect(
    within(await openSelect(picker)).getByRole("option", { name: /Email/ }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", { name: /Phone/ }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: /Date of birth/,
    }),
  ).toBeInTheDocument();
});

it("offers only date-of-birth fields in the condition-field picker when comparing age (#959)", async () => {
  render(<Harness initial={emptyDraft} fields={AGE_FILTER_FIELDS} />);
  await addConditionalRule();
  await chooseOption(screen.getByLabelText(/compare/i), "Age of field");
  const picker = screen.getByLabelText(/condition field/i);
  // date-of-birth-like fields (by label or id) are offered
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Date of birth (s.date-of-birth)",
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: "Applicant (s.dob)",
    }),
  ).toBeInTheDocument();
  expect(
    within(await openSelect(picker)).getByRole("option", {
      name: /Birth date/,
    }),
  ).toBeInTheDocument();
  // non-DOB fields are filtered out
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Email/ }),
  ).not.toBeInTheDocument();
  expect(
    within(await openSelect(picker)).queryByRole("option", { name: /Phone/ }),
  ).not.toBeInTheDocument();
});

it("clears a stale non-DOB selection when a rule switches to comparing age (#959)", async () => {
  render(<Harness initial={emptyDraft} fields={AGE_FILTER_FIELDS} />);
  await addConditionalRule();
  // Pick a non-DOB field while comparing the field value...
  await chooseOption(
    screen.getByLabelText(/condition field/i),
    new RegExp("\\(s\\.email\\)$"),
  );
  expect(screen.getByLabelText(/condition field/i)).toHaveTextContent(
    "s.email",
  );
  // ...then switch to age: the now-invalid path must be cleared, not kept alive
  // by the picker's (current) fallback.
  await chooseOption(screen.getByLabelText(/compare/i), "Age of field");
  expect(screen.getByLabelText(/condition field/i)).toHaveTextContent(
    "— select field —",
  );
});

it("keeps a DOB selection when a rule switches to comparing age (#959)", async () => {
  render(<Harness initial={emptyDraft} fields={AGE_FILTER_FIELDS} />);
  await addConditionalRule();
  await chooseOption(
    screen.getByLabelText(/condition field/i),
    new RegExp("\\(s\\.date-of-birth\\)$"),
  );
  await chooseOption(screen.getByLabelText(/compare/i), "Age of field");
  expect(screen.getByLabelText(/condition field/i)).toHaveTextContent(
    "s.date-of-birth",
  );
});

// ── Case Management System (CaMS) webhook (#2684) ───────────────────────────

const CAMS_FIELDS: ResolvedFieldId[] = [
  ...FIELDS,
  {
    fieldId: "first-name",
    editorFieldId: "e3",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "First name",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "last-name",
    editorFieldId: "e4",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Last name",
    isBoolean: false,
    isNumeric: false,
  },
  {
    fieldId: "phone",
    editorFieldId: "e5",
    stepId: "contact",
    stepTitle: "Contact",
    display: "Phone number",
    isBoolean: false,
    isNumeric: false,
  },
];

function camsDraft(extra: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    ...emptyDraft,
    mdaContactId: "11111111-1111-4111-8111-111111111111",
    processors: [
      {
        id: "cams-1",
        type: "webhook",
        config: {
          method: "POST",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10000,
          secret: "kept",
          mapping: {
            programmeCode: "RESTAURANT_LICENCE",
            applicant: { name: [], email: "", phone: "" },
            excludeSteps: ["check-your-answers"],
            groupByStep: true,
          },
        },
      },
    ],
    ...extra,
  };
}

function mapping(): Record<string, unknown> {
  return state()[0].config.mapping as Record<string, unknown>;
}

it("renders a CaMS webhook without any URL, auth or timeout fields", () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  expect(screen.getByLabelText(/^programme code/i)).toHaveValue(
    "RESTAURANT_LICENCE",
  );
  expect(screen.queryByLabelText(/^url$/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/method/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/signature header/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/timeout/i)).not.toBeInTheDocument();
  expect(screen.getByText(/come from this form's MDA contact/i)).toBeVisible();
});

it("edits the CaMS programme code into config.mapping and keeps unrendered keys", async () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  const input = screen.getByLabelText(/^programme code/i);
  await userEvent.clear(input);
  await userEvent.type(input, "HOTEL_LICENCE");
  expect(mapping().programmeCode).toBe("HOTEL_LICENCE");
  expect(state()[0].config.secret).toBe("kept");
  expect(state()[0].config).not.toHaveProperty("url");
});

it("uppercases the MDA code and removes it when emptied", async () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  const input = screen.getByLabelText(/^MDA code/i);
  await userEvent.type(input, "moh");
  expect(mapping().mdaCode).toBe("MOH");
  await userEvent.clear(input);
  expect(mapping()).not.toHaveProperty("mdaCode");
});

it("writes applicant name as an ordered first/last list, and phone and email paths", async () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  await chooseOption(
    screen.getByLabelText(/applicant first name/i),
    /\(applicant\.first-name\)$/,
  );
  expect(mapping().applicant).toMatchObject({ name: ["applicant.first-name"] });
  await chooseOption(
    screen.getByLabelText(/applicant last name/i),
    /\(applicant\.last-name\)$/,
  );
  await chooseOption(
    screen.getByLabelText(/applicant phone/i),
    /\(contact\.phone\)$/,
  );
  await chooseOption(
    screen.getByLabelText(/applicant email/i),
    /\(contact\.email\)$/,
  );
  expect(mapping().applicant).toEqual({
    name: ["applicant.first-name", "applicant.last-name"],
    email: "contact.email",
    phone: "contact.phone",
  });
});

it("toggles a step in the CaMS excluded steps", async () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  await userEvent.click(screen.getByRole("checkbox", { name: /declaration/i }));
  expect(mapping().excludeSteps).toEqual(["check-your-answers", "declaration"]);
  await userEvent.click(
    screen.getByRole("checkbox", { name: /check-your-answers/i }),
  );
  expect(mapping().excludeSteps).toEqual(["declaration"]);
  await userEvent.click(screen.getByRole("checkbox", { name: /^Applicant/ }));
  expect(mapping().excludeSteps).toEqual(["declaration", "applicant"]);
});

it("warns when a CaMS webhook has no MDA contact (null or absent)", () => {
  const { unmount } = render(
    <Harness
      initial={camsDraft({ mdaContactId: null })}
      fields={CAMS_FIELDS}
    />,
  );
  expect(screen.getByText(/choose an MDA contact/i)).toBeInTheDocument();
  unmount();
  render(
    <Harness
      initial={camsDraft({ mdaContactId: undefined })}
      fields={CAMS_FIELDS}
    />,
  );
  expect(screen.getByText(/choose an MDA contact/i)).toBeInTheDocument();
});

it("does not warn about the MDA contact when one is chosen", () => {
  render(<Harness initial={camsDraft()} fields={CAMS_FIELDS} />);
  expect(screen.queryByText(/choose an MDA contact/i)).not.toBeInTheDocument();
});
