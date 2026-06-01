/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import type { RecipeDraft, ResolvedFieldId } from "@govtech-bb/form-builder";
import { recipeReducer } from "./-recipe-reducer";
import { ProcessorsEditor } from "./-processors-editor";

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
  },
  {
    fieldId: "full-name",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Full name",
  },
];

const emptyDraft: RecipeDraft = { formId: "f", title: "T", steps: [] };

function Harness({ initial }: { initial: RecipeDraft }) {
  const [draft, dispatch] = useReducer(recipeReducer, initial);
  return (
    <>
      <ProcessorsEditor draft={draft} dispatch={dispatch} fields={FIELDS} />
      <pre data-testid="state">{JSON.stringify(draft.processors ?? [])}</pre>
    </>
  );
}

function state(): Array<{ type: string; config: Record<string, unknown> }> {
  return JSON.parse(screen.getByTestId("state").textContent || "[]");
}

async function addProcessor(type: string) {
  await userEvent.selectOptions(screen.getByLabelText(/processor type/i), type);
  await userEvent.click(screen.getByRole("button", { name: /add processor/i }));
}

beforeEach(() => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it("adds a processor of each authorable type", async () => {
  render(<Harness initial={emptyDraft} />);
  for (const type of ["email", "webhook", "spreadsheet", "opencrvs"]) {
    await addProcessor(type);
  }
  expect(state().map((p) => p.type)).toEqual([
    "email",
    "webhook",
    "spreadsheet",
    "opencrvs",
  ]);
});

it("does not offer payment as an addable type", () => {
  render(<Harness initial={emptyDraft} />);
  const select = screen.getByLabelText(/processor type/i);
  expect(within(select).queryByText(/payment/i)).not.toBeInTheDocument();
});

it("populates the recipient-field picker from the form's fields", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  const picker = screen.getByLabelText(/recipient field/i);
  expect(within(picker).getByRole("option", { name: /Email/ })).toHaveValue(
    "contact.email",
  );
  expect(within(picker).getByRole("option", { name: /Full name/ })).toHaveValue(
    "applicant.full-name",
  );
});

it("edits an email processor's recipient path", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("email");
  await userEvent.selectOptions(
    screen.getByLabelText(/recipient field/i),
    "contact.email",
  );
  expect(state()[0].config.recipientField).toBe("contact.email");
});

it("removes a processor", async () => {
  render(<Harness initial={emptyDraft} />);
  await addProcessor("webhook");
  expect(state()).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: /^remove$/i }));
  expect(state()).toHaveLength(0);
});

it("warns when no email processor is attached, and clears the warning once one is added", async () => {
  render(<Harness initial={emptyDraft} />);
  expect(screen.getByRole("alert")).toHaveTextContent(/email/i);
  await addProcessor("email");
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

it("shows an existing payment processor read-only, not editable", () => {
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
  expect(screen.getByText("Payment")).toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(/recipe json/i);
});
