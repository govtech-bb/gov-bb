/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import type { ContactDetails } from "@govtech-bb/form-types";
import { recipeReducer } from "./-recipe-reducer";
import { ContactDetailsEditor } from "./-contact-details-editor";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";

const emptyDraft: RecipeDraft = { formId: "f", title: "T", steps: [] };

const CONTACTS: MdaContact[] = [
  {
    id: "contact-1",
    label: "Ministry of Health",
    title: "Ministry of Health",
    telephone: "+1 246 555 0100",
    email: "health@gov.bb",
    address: { line1: "Jemmotts Lane", city: "Bridgetown" },
    mdaEmail: "notify@health.gov.bb",
  },
];

function Harness({
  initial,
  contacts = CONTACTS,
  onCreateContact = jest.fn((_input: CreateMdaContactInput) =>
    Promise.resolve(CONTACTS[0]),
  ),
}: {
  initial: RecipeDraft;
  contacts?: MdaContact[] | null;
  onCreateContact?: jest.Mock<Promise<MdaContact>, [CreateMdaContactInput]>;
}) {
  const [draft, dispatch] = useReducer(recipeReducer, initial);
  return (
    <>
      <ContactDetailsEditor
        draft={draft}
        dispatch={dispatch}
        contacts={contacts}
        onCreateContact={onCreateContact}
      />
      <pre data-testid="state">
        {JSON.stringify(draft.contactDetails ?? null)}
      </pre>
      <pre data-testid="mdaContactId">
        {JSON.stringify(draft.mdaContactId ?? null)}
      </pre>
    </>
  );
}

function mdaContactIdState(): string | null {
  return JSON.parse(
    screen.getByTestId("mdaContactId").textContent || "null",
  );
}

function state(): ContactDetails | null {
  return JSON.parse(screen.getByTestId("state").textContent || "null");
}

async function fillCore() {
  await userEvent.type(screen.getByLabelText(/organisation title/i), "Ministry");
  await userEvent.type(screen.getByLabelText(/telephone/i), "+1 246 555 0100");
  await userEvent.type(screen.getByLabelText(/^email/i), "health@gov.bb");
}

it("pre-fills inputs from existing contact details", () => {
  const initial: RecipeDraft = {
    ...emptyDraft,
    contactDetails: {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
      address: { line1: "Jemmotts Lane", city: "Bridgetown" },
    },
  };
  render(<Harness initial={initial} />);
  expect(screen.getByLabelText(/organisation title/i)).toHaveValue(
    "Ministry of Health",
  );
  expect(screen.getByLabelText(/telephone/i)).toHaveValue("+1 246 555 0100");
  expect(screen.getByLabelText(/^email/i)).toHaveValue("health@gov.bb");
  expect(screen.getByLabelText(/address line 1/i)).toHaveValue("Jemmotts Lane");
  expect(screen.getByLabelText(/city/i)).toHaveValue("Bridgetown");
});

it("saves valid details without an address", async () => {
  render(<Harness initial={emptyDraft} />);
  await fillCore();
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  expect(state()).toEqual({
    title: "Ministry",
    telephoneNumber: "+1 246 555 0100",
    email: "health@gov.bb",
  });
});

it("saves a full address as part of the details", async () => {
  render(<Harness initial={emptyDraft} />);
  await fillCore();
  await userEvent.type(screen.getByLabelText(/address line 1/i), "Jemmotts Lane");
  await userEvent.type(screen.getByLabelText(/city/i), "Bridgetown");
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  expect(state()?.address).toEqual({
    line1: "Jemmotts Lane",
    city: "Bridgetown",
  });
});

it("rejects an invalid email and does not dispatch", async () => {
  render(<Harness initial={emptyDraft} />);
  await userEvent.type(screen.getByLabelText(/organisation title/i), "Ministry");
  await userEvent.type(screen.getByLabelText(/telephone/i), "+1 246 555 0100");
  await userEvent.type(screen.getByLabelText(/^email/i), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  expect(screen.getByRole("alert")).toHaveTextContent(/email/i);
  expect(state()).toBeNull();
});

it("saves with a blank title now that the public fields are optional (issue #607)", async () => {
  render(<Harness initial={emptyDraft} />);
  await userEvent.type(screen.getByLabelText(/^telephone number$/i), "+1 246 555 0100");
  await userEvent.type(screen.getByLabelText(/^email$/i), "health@gov.bb");
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  // Title is optional now, so a blank title with a valid phone/email is saved
  // (the blank title is dropped to absent, not persisted as "").
  expect(state()).toEqual({
    telephoneNumber: "+1 246 555 0100",
    email: "health@gov.bb",
  });
});

it("rejects a partially-filled address (all-or-nothing group)", async () => {
  render(<Harness initial={emptyDraft} />);
  await fillCore();
  // line1 filled but city left blank → schema requires city when address present
  await userEvent.type(screen.getByLabelText(/address line 1/i), "Jemmotts Lane");
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(state()).toBeNull();
});

it("clears contact details back to absent", async () => {
  const initial: RecipeDraft = {
    ...emptyDraft,
    contactDetails: {
      title: "Ministry of Health",
      telephoneNumber: "+1 246 555 0100",
      email: "health@gov.bb",
    },
  };
  render(<Harness initial={initial} />);
  await userEvent.click(screen.getByRole("button", { name: /clear contact/i }));
  expect(state()).toBeNull();
});

// ── MDA contact dropdown (issue #607) ────────────────────────────────────────

it("lists the MDA contacts in the dropdown", () => {
  render(<Harness initial={emptyDraft} />);
  const select = screen.getByLabelText(/mda contact/i);
  expect(
    within(select).getByRole("option", { name: "Ministry of Health" }),
  ).toBeInTheDocument();
  expect(
    within(select).getByRole("option", { name: /create new contact/i }),
  ).toBeInTheDocument();
});

it("preselects the dropdown from the draft's mdaContactId", () => {
  const initial: RecipeDraft = { ...emptyDraft, mdaContactId: "contact-1" };
  render(<Harness initial={initial} />);
  expect(screen.getByLabelText(/mda contact/i)).toHaveValue("contact-1");
});

it("selecting a contact fills the public fields and records the id", async () => {
  render(<Harness initial={emptyDraft} />);
  await userEvent.selectOptions(
    screen.getByLabelText(/mda contact/i),
    "contact-1",
  );
  // Public contactDetails filled from the contact (telephone → telephoneNumber).
  expect(state()).toEqual({
    title: "Ministry of Health",
    telephoneNumber: "+1 246 555 0100",
    email: "health@gov.bb",
    address: { line1: "Jemmotts Lane", city: "Bridgetown" },
  });
  // And the contact id recorded on the draft (DB-only).
  expect(mdaContactIdState()).toBe("contact-1");
  // The inputs reflect the filled values too.
  expect(screen.getByLabelText(/organisation title/i)).toHaveValue(
    "Ministry of Health",
  );
});

it("selecting — none — clears the recorded id", async () => {
  const initial: RecipeDraft = { ...emptyDraft, mdaContactId: "contact-1" };
  render(<Harness initial={initial} />);
  await userEvent.selectOptions(screen.getByLabelText(/mda contact/i), "");
  expect(mdaContactIdState()).toBeNull();
});

it("creating a new contact posts it and selects the created contact", async () => {
  const created: MdaContact = {
    id: "contact-new",
    label: "Ministry of Finance",
    title: "Ministry of Finance",
    telephone: "+1 246 555 0200",
    email: "finance@gov.bb",
    address: null,
    mdaEmail: "notify@finance.gov.bb",
  };
  const onCreateContact = jest.fn((_input: CreateMdaContactInput) =>
    Promise.resolve(created),
  );
  render(<Harness initial={emptyDraft} onCreateContact={onCreateContact} />);

  await userEvent.selectOptions(
    screen.getByLabelText(/mda contact/i),
    "__create__",
  );
  // Fill the create-form fields that carry labels unique to the create card
  // (the main panel re-uses "Organisation title"/"Telephone number"). The
  // create call is mocked, so client-side completeness isn't under test here.
  await userEvent.type(screen.getByLabelText(/^label$/i), "Ministry of Finance");
  await userEvent.type(screen.getByLabelText(/public email/i), "finance@gov.bb");
  await userEvent.type(
    screen.getByLabelText(/mda notification email/i),
    "notify@finance.gov.bb",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /create and select/i }),
  );

  expect(onCreateContact).toHaveBeenCalledTimes(1);
  const input = onCreateContact.mock.calls[0][0];
  expect(input.label).toBe("Ministry of Finance");
  expect(input.email).toBe("finance@gov.bb");
  expect(input.mdaEmail).toBe("notify@finance.gov.bb");
  // After creation the contact is selected: id recorded + fields filled.
  expect(mdaContactIdState()).toBe("contact-new");
  expect(state()).toEqual({
    title: "Ministry of Finance",
    telephoneNumber: "+1 246 555 0200",
    email: "finance@gov.bb",
  });
});
