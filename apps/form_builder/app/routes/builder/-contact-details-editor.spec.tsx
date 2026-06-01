/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import type { ContactDetails } from "@govtech-bb/form-types";
import { recipeReducer } from "./-recipe-reducer";
import { ContactDetailsEditor } from "./-contact-details-editor";

const emptyDraft: RecipeDraft = { formId: "f", title: "T", steps: [] };

function Harness({ initial }: { initial: RecipeDraft }) {
  const [draft, dispatch] = useReducer(recipeReducer, initial);
  return (
    <>
      <ContactDetailsEditor draft={draft} dispatch={dispatch} />
      <pre data-testid="state">
        {JSON.stringify(draft.contactDetails ?? null)}
      </pre>
    </>
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

it("enforces required fields (empty title is rejected)", async () => {
  render(<Harness initial={emptyDraft} />);
  await userEvent.type(screen.getByLabelText(/telephone/i), "+1 246 555 0100");
  await userEvent.type(screen.getByLabelText(/^email/i), "health@gov.bb");
  await userEvent.click(screen.getByRole("button", { name: /save contact/i }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(state()).toBeNull();
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
