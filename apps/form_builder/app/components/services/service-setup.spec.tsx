/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import { useState, type ReactNode } from "react";
import { render, screen, waitFor, within } from "../../test/ui";
import { chooseOption, openSelect } from "../../test/select";
import userEvent from "@testing-library/user-event";
import {
  serviceSnapshotSchema,
  type ServiceDraft,
  type ServiceSnapshot,
} from "@govtech-bb/form-types";
import { listMdaContacts } from "../../server/mda-contacts";
import { previewRecipe } from "../../server/registry";
import { ServiceSetup } from "./service-setup";
import type { ServiceState } from "./service-state";

vi.mock("@tanstack/react-router", () => ({ useBlocker: vi.fn() }));
vi.mock("../../server/mda-contacts", () => ({ listMdaContacts: vi.fn() }));
vi.mock("../../server/registry", () => ({ previewRecipe: vi.fn() }));
vi.mock("../app-link", () => ({
  AppLink: ({ children }: { children: ReactNode }) => (
    <a href="#">{children}</a>
  ),
}));

const departments = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Housing",
    title: "Housing",
    telephone: "",
    email: "help@example.test",
    mdaEmail: "housing@example.test",
    address: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Planning",
    title: "Planning",
    telephone: "",
    email: "help@example.test",
    mdaEmail: "planning@example.test",
    address: null,
  },
];
const saved = vi.fn();

function draft(): ServiceDraft {
  return {
    ...serviceSnapshotSchema.parse({
      manifest: {
        serviceId: "housing",
        title: "Housing",
        schemaVersion: 1,
        formId: "housing",
        pages: [],
        entryPoint: "form",
      },
      pages: [],
      pendingConfig: { mdaContactId: departments[0].id, processors: null },
      recipe: {
        formId: "housing",
        title: "Housing",
        steps: [],
        processors: [
          {
            type: "email",
            config: {
              recipientField: "contact.email",
              subject: "Your application was received",
              label: "Applicant copy",
            },
          },
          {
            type: "email",
            config: {
              recipientField: "config.mdaEmail",
              subject: "New housing application",
            },
          },
        ],
      },
    }),
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: "dev",
  };
}

function Harness({ initial = draft() }: { initial?: ServiceDraft }) {
  const [value, setValue] = useState(initial);
  const workspace = {
    draft: value,
    error: null,
    save: async (snapshot: ServiceSnapshot) => {
      saved(snapshot);
      const next = { ...value, ...snapshot, revision: value.revision + 1 };
      setValue(next);
      return next;
    },
  } as ServiceState;
  return (
    <ServiceSetup workspace={workspace} section="delivery" />
  );
}

beforeEach(() => {
  saved.mockClear();
  vi.mocked(listMdaContacts).mockResolvedValue(departments);
  vi.mocked(previewRecipe).mockResolvedValue({
    steps: [
      {
        stepId: "contact",
        title: "Contact details",
        elements: [
          { fieldId: "email", htmlType: "email", label: "Email address" },
          {
            fieldId: "other-email",
            htmlType: "email",
            label: "Other email address",
          },
          { fieldId: "name", htmlType: "text", label: "Name" },
        ],
      },
    ],
  } as Awaited<ReturnType<typeof previewRecipe>>);
});

it("shows existing recipients without a wizard and turns off only the applicant email", async () => {
  const initial = draft();
  render(<Harness initial={initial} />);
  expect(
    screen.queryByRole("navigation", { name: "Setup steps" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save and continue" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Applicant email" }),
    ).toHaveTextContent("Contact details · Email address"),
  );
  expect(
    screen.getByRole("combobox", { name: "Department notification email" }),
  ).toHaveTextContent("housing@example.test");

  await chooseOption(
    screen.getByRole("combobox", { name: "Applicant email" }),
    "Contact details · Other email address",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors[0].config).toEqual({
    ...initial.recipe!.processors![0].config,
    recipientField: "contact.other-email",
  });
  await chooseOption(
    screen.getByRole("combobox", { name: "Applicant email" }),
    "Do not send a confirmation email",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors).toEqual([
    initial.recipe!.processors![1],
  ]);
  expect(saved.mock.lastCall![0].manifest.setup).toMatchObject({
    applicantEmail: "none",
    delivery: "configured",
  });
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
});

it("changes the department without adding a duplicate email or losing its subject", async () => {
  const initial = draft();
  render(<Harness initial={initial} />);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Department notification email" }),
    ).toBeEnabled(),
  );
  await chooseOption(
    screen.getByRole("combobox", { name: "Department notification email" }),
    "Planning · planning@example.test",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors).toEqual(
    initial.recipe!.processors,
  );
  expect(saved.mock.lastCall![0].pendingConfig.mdaContactId).toBe(
    departments[1].id,
  );

  await chooseOption(
    screen.getByRole("combobox", { name: "Department notification email" }),
    "Do not send a department email",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors).toEqual([
    initial.recipe!.processors![0],
  ]);
  expect(saved.mock.lastCall![0].manifest.setup).toMatchObject({
    applicantEmail: "configured",
    delivery: "none",
  });
});

it("asks for a missing department without duplicating its existing email action", async () => {
  const initial = draft();
  initial.pendingConfig!.mdaContactId = null;
  render(<Harness initial={initial} />);
  const recipient = screen.getByRole("combobox", {
    name: "Department notification email",
  });
  await waitFor(() => expect(recipient).toBeEnabled());
  expect(recipient).toHaveTextContent("Choose a department");
  expect(
    screen.getByText(
      "Choose the department that should receive these applications.",
    ),
  ).toBeInTheDocument();
  await chooseOption(recipient, "Housing · housing@example.test");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors).toEqual(
    initial.recipe!.processors,
  );
  expect(saved.mock.lastCall![0].pendingConfig.mdaContactId).toBe(
    departments[0].id,
  );
});

it("protects a department shared with a webhook when editing or disabling email", async () => {
  const initial = draft();
  const webhook = {
    type: "webhook" as const,
    config: {
      url: "https://example.test/webhook",
      method: "POST" as const,
      signatureHeader: "X-Signature",
      timeoutMs: 10000,
      headers: { "X-Client": "housing" },
    },
  };
  initial.recipe!.processors!.push(webhook);
  render(<Harness initial={initial} />);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Department notification email" }),
    ).toBeEnabled(),
  );
  const list = await openSelect(
    screen.getByRole("combobox", { name: "Department notification email" }),
  );
  expect(
    within(list).getByRole("option", {
      name: "Planning · planning@example.test",
    }),
  ).toHaveAttribute("aria-disabled", "true");
  await userEvent.keyboard("{Escape}");
  await chooseOption(
    screen.getByRole("combobox", { name: "Department notification email" }),
    "Do not send a department email",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].pendingConfig).toEqual(initial.pendingConfig);
  expect(saved.mock.lastCall![0].recipe.processors).toEqual([
    initial.recipe!.processors![0],
    webhook,
  ]);
});

it("keeps saved recipients visible and unchanged when lookups fail", async () => {
  vi.mocked(listMdaContacts).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(previewRecipe).mockRejectedValue(new Error("Unavailable"));
  const initial = draft();
  render(<Harness initial={initial} />);
  await screen.findByText(/Email questions could not be loaded/);
  expect(
    screen.getByRole("combobox", { name: "Applicant email" }),
  ).toHaveTextContent("contact.email");
  expect(
    screen.getByRole("combobox", { name: "Applicant email" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "Department notification email" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved.mock.lastCall![0].recipe.processors).toEqual(
    initial.recipe!.processors,
  );
});

it("edits email subjects and connections in one screen while preserving payment config", async () => {
  const user = userEvent.setup();
  const initial = draft();
  const webhook = {
    type: "webhook" as const,
    config: {
      url: "https://example.test/old",
      method: "POST" as const,
      signatureHeader: "X-Signature",
      timeoutMs: 10000,
      headers: { "X-Client": "housing" },
    },
  };
  initial.recipe!.processors!.push(webhook);
  initial.pendingConfig.processors = [
    {
      type: "payment",
      config: {
        provider: "ezpay",
        department: "Treasury",
        paymentCode: "FEE-001",
        amount: 50,
        description: "Application fee",
        customerEmailPath: "contact.email",
        customerNamePath: "contact.name",
      },
    },
  ];
  render(<Harness initial={initial} />);
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Applicant email" }),
    ).toBeEnabled(),
  );
  const subject = screen.getByRole("textbox", {
    name: "Applicant email subject",
  });
  await user.clear(subject);
  await user.type(subject, "We received your application");
  await user.click(
    screen.getByRole("button", { name: "Advanced action settings" }),
  );
  const url = screen.getByRole("textbox", { name: "URL" });
  await user.clear(url);
  await user.type(url, "https://example.test/new");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const snapshot = saved.mock.lastCall![0] as ServiceSnapshot;
  expect(snapshot.recipe!.processors).toEqual([
    {
      ...initial.recipe!.processors![0],
      config: {
        ...initial.recipe!.processors![0].config,
        subject: "We received your application",
      },
    },
    initial.recipe!.processors![1],
    {
      ...webhook,
      config: { ...webhook.config, url: "https://example.test/new" },
    },
  ]);
  expect(snapshot.pendingConfig).toEqual(initial.pendingConfig);
  expect(snapshot.recipe!.steps).toEqual(initial.recipe!.steps);
  expect(
    screen.getAllByRole("heading", { name: "After submission" }),
  ).toHaveLength(1);
});

it("keeps incomplete payments in the editor and explains what prevents saving", async () => {
  render(<Harness />);
  await userEvent.click(
    screen.getByRole("button", { name: "Advanced action settings" }),
  );
  await chooseOption(
    screen.getByRole("combobox", { name: "Action" }),
    "Payment",
  );
  await userEvent.click(screen.getByRole("button", { name: "Add action" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Complete the payment settings",
  );
  expect(
    screen.getByRole("textbox", { name: "Payment code" }),
  ).toBeInTheDocument();
});
