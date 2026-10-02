/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import { useState, type ReactNode } from "react";
import { render, screen, waitFor, within } from "../../test/ui";
import userEvent from "@testing-library/user-event";
import { chooseOption } from "../../test/select";
import {
  serviceSnapshotSchema,
  type ServiceSnapshot,
} from "@govtech-bb/form-types";
import { getCatalogFn } from "../../server/registry";
import { ServiceJourney } from "./service-journey";
import type { ServiceState } from "./service-state";

vi.mock("../../server/registry", () => ({ getCatalogFn: vi.fn() }));
vi.mock("../app-link", () => ({
  AppLink: ({
    children,
    to,
    search,
  }: {
    children: ReactNode;
    to: string;
    search: Record<string, string>;
  }) => <a href={`${to}?${new URLSearchParams(search)}`}>{children}</a>,
}));
const save = vi.fn();
function snapshot() {
  return serviceSnapshotSchema.parse({
    manifest: {
      schemaVersion: 1,
      serviceId: "housing",
      title: "Housing",
      formId: "housing",
      entryPoint: "11111111-1111-4111-8111-111111111111",
      pages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          kind: "main",
          title: "Apply for housing",
          path: "apps/landing/src/content/housing/index.md",
          publicPath: "/housing",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          kind: "guidance",
          title: "Help with housing",
          path: "apps/landing/src/content/housing/help.md",
          publicPath: "/housing/help",
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          kind: "start",
          title: "Apply for housing",
          path: "apps/landing/src/content/housing/start.md",
          publicPath: "/housing/start",
        },
      ],
    },
    pages: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        path: "apps/landing/src/content/housing/index.md",
        body: "[Help](/housing/help)\n<a data-start-link>Start now</a>",
        frontmatter: {},
        baseSha: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        path: "apps/landing/src/content/housing/help.md",
        body: "Get help with your application.",
        frontmatter: {},
        baseSha: null,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        path: "apps/landing/src/content/housing/start.md",
        body: "",
        frontmatter: { redirect_to: "/housing" },
        baseSha: null,
      },
    ],
    pendingConfig: { mdaContactId: null, processors: null },
    recipe: {
      formId: "housing",
      title: "Housing application",
      steps: [
        { stepId: "details", title: "Your details", elements: [] },
        { stepId: "declaration", title: "Declaration", elements: [] },
        {
          stepId: "submission-confirmation",
          title: "Application received",
          elements: [],
        },
      ],
    },
  });
}
function Harness({ initial = snapshot() }: { initial?: ServiceSnapshot }) {
  const [value, setValue] = useState(initial);
  const workspace = {
    saving: false,
    save: async (next: ServiceSnapshot) => {
      if (!(await save(next))) return null;
      setValue(next);
      return {
        ...next,
        revision: 2,
        updatedAt: new Date().toISOString(),
        updatedBy: "dev",
      };
    },
  } as ServiceState;
  return <ServiceJourney snapshot={value} workspace={workspace} />;
}
beforeEach(() => {
  sessionStorage.clear();
  save.mockReset().mockResolvedValue(true);
  vi.mocked(getCatalogFn).mockResolvedValue({
    components: [],
    blocks: [],
    custom: [],
  });
});
it("shows distinct page details and preserves the redirect outside the map", async () => {
  render(<Harness />);
  expect(
    screen.queryByRole("combobox", { name: "From page" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole("button", {
      name: "View Help with housing, /housing/help",
    }),
  );
  const details = screen.getByRole("region", { name: "Selected page details" });
  expect(within(details).getByText("/housing/help")).toBeInTheDocument();
  expect(
    within(
      screen
        .getByRole("button", { name: "View Help with housing, /housing/help" })
        .closest("li")!,
    ).getByRole("link", { name: "Edit page" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: "View Apply for housing, /housing/start",
    }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Redirects (1)" }));
  expect(await screen.findByText("/housing/start")).toBeVisible();
  expect(screen.getByText("Goes to /housing")).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "Form pages" }));
  expect(
    await screen.findByRole("button", { name: "View Your details" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: "View Help with housing, /housing/help",
    }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "List" }));
  expect(
    await screen.findByRole("button", { name: "Move Your details later" }),
  ).toBeDisabled();
});
it("adds a link from the selected page and keeps a failed save open for retry", async () => {
  render(<Harness />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: "View Help with housing, /housing/help",
    }),
  );
  await userEvent.click(
    within(
      screen.getByRole("region", { name: "Selected page details" }),
    ).getByRole("button", { name: "Add link" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Add a page link" });
  expect(
    within(dialog).getByRole("combobox", { name: "From page" }),
  ).toHaveTextContent("Help with housing · /housing/help");
  await chooseOption(
    within(dialog).getByRole("combobox", { name: "Link to" }),
    "Application form",
  );
  expect(
    within(dialog).getByRole("textbox", { name: "Link text" }),
  ).toHaveValue("Start now");
  save.mockResolvedValueOnce(false);
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Save link" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Could not save the link",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Save link" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  const next: ServiceSnapshot = save.mock.lastCall![0];
  expect(next.pages[0]).toEqual(snapshot().pages[0]);
  expect(next.pages[1].body).toContain("<a data-start-link>Start now</a>");
  expect(next.pages[2]).toEqual(snapshot().pages[2]);
  expect(screen.getByRole("status")).toHaveTextContent("Page link saved");
});

it("shows saved conditions and both destinations in the map and list", async () => {
  const initial = snapshot();
  initial.recipe!.steps[0].elements = [
    {
      ref: "components/generic-radio",
      overrides: {
        fieldId: "help",
        label: "Do you need help?",
        options: [{ value: "yes", label: "Yes please" }],
      },
    },
  ];
  initial.recipe!.steps.splice(1, 0, {
    stepId: "help-details",
    title: "Tell us what you need",
    elements: [],
    behaviours: [
      {
        type: "stepConditionalOn",
        targetStepId: "details",
        targetFieldId: "help",
        operator: "equal",
        value: "yes",
      },
      {
        type: "stepConditionalOn",
        targetStepId: "details",
        targetFieldId: "help",
        operator: "exists",
        value: "",
      },
    ],
  });
  const firstVisit = render(<Harness initial={initial} />);
  await userEvent.click(screen.getByRole("tab", { name: "Form pages" }));
  const condition = await screen.findByRole("button", {
    name: "View Condition for Tell us what you need",
  });
  expect(await within(condition).findByText("Yes please")).toBeInTheDocument();
  expect(within(condition).getAllByText("Do you need help?")).toHaveLength(2);
  expect(within(condition).getByText("and")).toBeInTheDocument();
  expect(within(condition).getByText("has an answer")).toBeInTheDocument();
  await userEvent.click(condition);
  const details = screen.getByRole("region", { name: "Selected page details" });
  expect(
    within(condition.closest("li")!).getByRole("link", {
      name: "Edit condition",
    }),
  ).toHaveAttribute("href", expect.stringContaining("focus=logic"));
  expect(
    within(details).getByRole("button", { name: "Tell us what you need" }),
  ).toBeInTheDocument();
  expect(
    within(details).getByRole("button", { name: "Declaration" }),
  ).toBeInTheDocument();
  expect(within(details).getByText("Yes")).toBeInTheDocument();
  expect(within(details).getByText("No")).toBeInTheDocument();
  await userEvent.tab();
  expect(screen.getByRole("link", { name: "Edit condition" })).toHaveFocus();
  firstVisit.unmount();
  render(<Harness initial={initial} />);
  expect(
    await screen.findByRole("tab", { name: "Form pages" }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await screen.findByRole("button", {
      name: "View Condition for Tell us what you need",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    within(
      screen.getByRole("region", { name: "Selected page details" }),
    ).getByRole("heading", { name: "Condition for Tell us what you need" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "List" }));
  expect(
    await screen.findByRole("link", { name: "Edit condition" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: "Move Condition for Tell us what you need later",
    }),
  ).not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
