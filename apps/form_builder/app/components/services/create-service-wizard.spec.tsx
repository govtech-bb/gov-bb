/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "../../test/ui";
import { chooseOption } from "../../test/select";
import userEvent from "@testing-library/user-event";
import type { FormsListState } from "../builder/use-forms-list";
import type { ContentListState } from "../content/use-content-list";
import type { BuilderFormSummary } from "../../types";
import { Route as ServicesRoute } from "../../routes/services";
import { attachServiceForm } from "../../lib/service-drafts";
import { AppShell } from "../app-shell";
import { emptyService } from "./service-state";
import { CreateServiceWizard } from "./create-service-wizard";

const department = vi.hoisted(() => ({
  id: "11111111-1111-4111-8111-111111111111",
  label: "Housing",
  title: "Housing",
  telephone: "",
  email: "help@example.test",
  mdaEmail: "housing@example.test",
  address: null,
}));
let forms: FormsListState;
let content: ContentListState;
vi.mock("../../server/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/services")>()),
  getServiceUser: vi.fn(async () => "test"),
  loadServiceSource: vi.fn(async () => {
    throw new Error("Legacy service fixture");
  }),
}));
vi.mock("../../server/mda-contacts", () => ({
  listMdaContacts: vi.fn(async () => [department]),
}));
vi.mock("../../server/auth", () => ({ checkSession: vi.fn() }));
vi.mock("../builder/use-forms-list", () => ({ useFormsList: () => forms }));
vi.mock("../content/use-content-list", () => ({
  useContentList: () => content,
}));
vi.mock("../../hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../lib/service-drafts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/service-drafts")>()),
  attachServiceForm: vi.fn(),
}));

const alpha: BuilderFormSummary = {
  id: "alpha",
  formId: "alpha",
  title: "Alpha service",
  version: "1.0.0",
  isPublished: true,
};
const beta: BuilderFormSummary = {
  ...alpha,
  id: "beta",
  formId: "beta",
  title: "Beta service",
  isPublished: false,
};

beforeEach(() => {
  localStorage.clear();
  vi.mocked(attachServiceForm).mockReset();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  forms = {
    forms: [alpha, beta],
    loadError: null,
    openPRs: new Map(),
    refetch: vi.fn(),
    upsertForm: vi.fn(),
  };
  content = {
    pages: [],
    openPRs: new Map(),
    reviewSnapshot: { complete: true, claims: [] },
    loading: false,
    loadError: null,
    reviewError: null,
    refetch: vi.fn(),
  };
});

afterEach(() => vi.restoreAllMocks());

function BuilderStub() {
  const search = useSearch({ strict: false });
  return (
    <>
      <h1>Form editor</h1>
      <output data-testid="builder-search">{JSON.stringify(search)}</output>
    </>
  );
}

function renderWizard() {
  const root = createRootRoute({
    component: Outlet,
    beforeLoad: () => ({ user: { login: "test" } }),
  });
  const wizard = createRoute({
    getParentRoute: () => root,
    path: "/services/new",
    component: () => (
      <AppShell section="services" user="test" title="Create a service">
        <CreateServiceWizard />
      </AppShell>
    ),
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    component: ServicesRoute.options.component,
    validateSearch: ServicesRoute.options.validateSearch,
  });
  const builder = createRoute({
    getParentRoute: () => root,
    path: "/builder",
    component: BuilderStub,
  });
  const router = createRouter({
    routeTree: root.addChildren([wizard, services, builder]),
    history: createMemoryHistory({ initialEntries: ["/services/new"] }),
  });
  return render(<RouterProvider router={router} />);
}

const draftKey = "service-workspace:v1:test:pension-advice";
const savedDraft = () => JSON.parse(localStorage.getItem(draftKey)!);
const nextButton = () => screen.getByRole("button", { name: "Continue" });

async function fillAbout(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    await screen.findByRole("textbox", { name: "Service name" }),
    "Pension advice",
  );
  await chooseOption(
    screen.getByRole("combobox", { name: "Category" }),
    "Education",
  );
}

it("needs a name and a category before continuing, and previews the public link", async () => {
  const user = userEvent.setup();
  renderWizard();
  const next = await screen.findByRole("button", { name: "Continue" });
  expect(next).toBeDisabled();
  expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
    "href",
    "/services",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Service name" }),
    "Pension advice",
  );
  expect(next).toBeDisabled();
  await chooseOption(
    screen.getByRole("combobox", { name: "Category" }),
    "Education",
  );
  expect(screen.getByText("/education/pension-advice")).toBeInTheDocument();
  expect(next).toBeEnabled();
});

it("refuses a name whose link already belongs to a service", async () => {
  localStorage.setItem(
    draftKey,
    JSON.stringify({
      ...emptyService("Pension advice"),
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: "test",
    }),
  );
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  expect(nextButton()).toBeDisabled();
});

it("creates the service with its main page and department contact", async () => {
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  await user.type(
    screen.getByRole("textbox", {
      name: "What does this service help people do?",
    }),
    "Advice on pensions",
  );
  await user.click(nextButton());
  await user.click(await screen.findByRole("radio", { name: /No form/ }));
  await user.click(nextButton());
  const contact = await screen.findByRole("combobox", {
    name: "Department contact",
  });
  await waitFor(() => expect(contact).toBeEnabled());
  await chooseOption(contact, "Housing");
  await user.click(screen.getByRole("button", { name: "Create service" }));
  await screen.findByRole("heading", { name: "Pension advice", level: 1 });
  const saved = savedDraft();
  expect(saved.manifest).toMatchObject({
    title: "Pension advice",
    category: "education",
    description: "Advice on pensions",
    formId: null,
    contactDetails: { title: "Housing", email: "help@example.test" },
  });
  expect(saved.manifest.pages).toHaveLength(1);
  expect(saved.manifest.pages[0]).toMatchObject({
    kind: "main",
    path: "apps/landing/src/content/pension-advice/index.md",
    publicPath: "/education/pension-advice",
  });
  expect(saved.manifest.entryPoint).toBe(saved.manifest.pages[0].id);
  expect(saved.pages[0].frontmatter.form_id).toBeUndefined();
  expect(saved.pages[0].body).not.toContain("data-start-link");
  expect(attachServiceForm).not.toHaveBeenCalled();
});

it("connects an existing form and points the page's Start button at it", async () => {
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  await user.click(nextButton());
  await user.click(
    await screen.findByRole("radio", { name: /Connect an existing form/ }),
  );
  await chooseOption(
    screen.getByRole("combobox", { name: "Form" }),
    /Beta service/,
  );
  await user.click(nextButton());
  await user.click(
    await screen.findByRole("button", { name: "Create service" }),
  );
  await screen.findByRole("heading", { name: "Pension advice", level: 1 });
  expect(attachServiceForm).toHaveBeenCalledWith({
    data: { serviceId: "pension-advice", expectedRevision: 1, formId: "beta" },
  });
  const saved = savedDraft();
  expect(saved.pages[0].frontmatter.form_id).toBe("beta");
  expect(saved.pages[0].body).toContain("data-start-link");
});

it("opens the form builder when building a new form", async () => {
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  await user.click(nextButton());
  expect(
    await screen.findByRole("radio", { name: /Build a new form/ }),
  ).toBeChecked();
  await user.click(nextButton());
  await user.click(
    await screen.findByRole("button", { name: "Create service" }),
  );
  await screen.findByRole("heading", { name: "Form editor" });
  expect(JSON.parse(screen.getByTestId("builder-search").textContent!)).toEqual(
    {
      newFormId: "pension-advice",
      title: "Pension advice",
      service: "pension-advice",
    },
  );
  expect(savedDraft().pages[0].frontmatter.form_id).toBe("pension-advice");
});

it("keeps entered details when going back", async () => {
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  await user.click(nextButton());
  await screen.findByRole("heading", { name: "Application form", level: 2 });
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    await screen.findByRole("textbox", { name: "Service name" }),
  ).toHaveValue("Pension advice");
  expect(
    screen.getByRole("combobox", { name: "Category" }),
  ).toHaveTextContent("Education");
});

it("offers to connect a form that already uses the service's name", async () => {
  forms.forms = [
    ...forms.forms!,
    {
      ...alpha,
      id: "pension-advice",
      formId: "pension-advice",
      title: "Pension advice form",
    },
  ];
  const user = userEvent.setup();
  renderWizard();
  await fillAbout(user);
  await user.click(nextButton());
  expect(
    await screen.findByRole("radio", { name: /Build a new form/ }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("radio", { name: /Connect an existing form/ }),
  ).toBeChecked();
  expect(screen.getByRole("combobox", { name: "Form" })).toHaveTextContent(
    "Pension advice form",
  );
});
