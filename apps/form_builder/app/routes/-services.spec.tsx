/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "../test/ui";
import userEvent from "@testing-library/user-event";
import type { FormsListState } from "../components/builder/use-forms-list";
import type { ContentListState } from "../components/content/use-content-list";
import type { ContentPageSummary } from "../server/content";
import type { BuilderFormSummary } from "../types";
import { Route } from "./services";
import { draftKeyFor, readDraft, writeDraft } from "../components/content/draft-store";
import type { ServiceSnapshot } from "@govtech-bb/form-types";
import { emptyService } from "../components/services/service-state";
import { loadServiceSource } from "../server/services";
import { EMPTY_PAGE, appendServicePage, startPageContentPath } from "../lib/content";

let forms: FormsListState;
let content: ContentListState;
vi.mock("../server/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/services")>()),
  getServiceUser: vi.fn(async () => "test"),
  loadServiceSource: vi.fn(async () => {
    throw new Error("Legacy service fixture");
  }),
}));
vi.mock("../server/mda-contacts", () => ({ listMdaContacts: vi.fn(async () => []) }));
vi.mock("../server/auth", () => ({ checkSession: vi.fn() }));
vi.mock("../components/builder/use-forms-list", () => ({
  useFormsList: () => forms,
}));
vi.mock("../components/content/use-content-list", () => ({
  useContentList: () => content,
}));
vi.mock("../hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));

const alpha: BuilderFormSummary = {
  id: "alpha",
  formId: "alpha",
  title: "Alpha service",
  version: "1.0.0",
  isPublished: true,
};
const alphaPage: ContentPageSummary = {
  path: "apps/landing/src/content/health/alpha.md",
  title: "Alpha page",
  category: "health",
  visibility: "public",
  formId: "alpha",
  hasFormButton: true,
};

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  forms = {
    forms: [
      alpha,
      {
        ...alpha,
        id: "beta",
        formId: "beta",
        title: "Beta service",
        isPublished: false,
      },
    ],
    loadError: null,
    openPRs: new Map(),
    refetch: vi.fn(),
    upsertForm: vi.fn(),
  };
  content = {
    pages: [alphaPage],
    openPRs: new Map(),
    reviewSnapshot: { complete: true, claims: [] },
    loading: false,
    loadError: null,
    reviewError: null,
    refetch: vi.fn(),
  };
});

afterEach(() => vi.restoreAllMocks());

function renderServices(initialEntry = "/services") {
  const root = createRootRoute({
    component: Outlet,
    beforeLoad: () => ({ user: { login: "test" } }),
  });
  const services = createRoute({
    getParentRoute: () => root,
    path: "/services",
    component: Route.options.component,
    validateSearch: Route.options.validateSearch,
  });
  const builder = createRoute({
    getParentRoute: () => root,
    path: "/builder",
    component: () => <h1>Form editor</h1>,
  });
  const editor = createRoute({
    getParentRoute: () => root,
    path: "/content/edit",
    component: () => <h1>Content editor</h1>,
  });
  const pages = createRoute({
    getParentRoute: () => root,
    path: "/content",
    component: () => <h1>Pages</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([services, builder, editor, pages]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  return render(<RouterProvider router={router} />);
}

function linkUrl(name: string | RegExp) {
  return new URL(
    screen.getByRole("link", { name }).getAttribute("href")!,
    "http://localhost",
  );
}

it("searches services, changes view, and opens a workspace without losing the library filters", async () => {
  const user = userEvent.setup();
  renderServices();
  await screen.findByRole("heading", { name: "Service library", level: 1 });
  expect(
    within(screen.getByRole("list", { name: "Services" })).getAllByRole("link"),
  ).toHaveLength(2);
  await user.type(screen.getByRole("searchbox", { name: "Search services" }), "ALPHA");
  expect(screen.getByRole("status")).toHaveTextContent("1 service found");
  await user.click(screen.getByRole("button", { name: "List view" }));
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(screen.getByRole("link", { name: /Alpha service/ }));
  await screen.findByRole("heading", { name: "Alpha service", level: 1 });
  expect(screen.getByRole("main")).toHaveFocus();
  const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
  expect(breadcrumb).toHaveTextContent("Alpha service");
  expect(linkUrl("Edit form").searchParams.get("formId")).toBe("alpha");
  expect(linkUrl("Edit Alpha page").searchParams.get("path")).toBe(alphaPage.path);
  expect(linkUrl("Edit Alpha page").searchParams.get("service")).toBe("form:alpha");
  expect(
    screen.queryByRole("link", { name: "Create start page" }),
  ).not.toBeInTheDocument();
  await user.click(within(breadcrumb).getAllByRole("link", { name: "Services" })[0]);
  expect(await screen.findByRole("searchbox", { name: "Search services" })).toHaveValue(
    "ALPHA",
  );
  expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("links to the create-service wizard", async () => {
  renderServices();
  await screen.findByRole("heading", { name: "Service library", level: 1 });
  expect(linkUrl("Create a service").pathname).toBe("/services/new");
});

it("creates guidance separately, preserves the existing main draft, and offers only the service's form", async () => {
  const user = userEvent.setup();
  const original = {
    version: 2,
    state: { title: "Original draft" },
    revision: { source: "base", sha: "main" },
  };
  writeDraft(draftKeyFor(alphaPage.path), original);
  renderServices("/services?service=form%3Aalpha");
  await screen.findByRole("heading", { name: "Alpha service", level: 1 });
  expect(screen.queryByRole("link", { name: "Create form" })).not.toBeInTheDocument();
  expect(linkUrl("Edit form").searchParams.get("service")).toBe("form:alpha");
  await user.click(screen.getByRole("button", { name: "Add content page" }));
  await user.type(screen.getByRole("textbox", { name: "Page title" }), "Help");
  await user.click(screen.getByRole("button", { name: "Create page" }));
  await screen.findByRole("heading", { name: "Content editor" });
  expect(readDraft(draftKeyFor(alphaPage.path))).toEqual(original);
  expect(
    readDraft(draftKeyFor("apps/landing/src/content/health/alpha/help.md")),
  ).toMatchObject({
    revision: { source: "absent" },
    state: { title: "Help", formId: "alpha", linkType: "none" },
  });
});

it("creates the first page without requiring a separate start page", async () => {
  const user = userEvent.setup();
  renderServices("/services?service=form%3Abeta");
  await screen.findByRole("heading", { name: "Beta service", level: 1 });
  await user.click(screen.getByRole("button", { name: "Add content page" }));
  expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue("Beta service");
  await user.click(screen.getByRole("button", { name: "Create page" }));
  await screen.findByRole("heading", { name: "Content editor" });
  expect(readDraft(draftKeyFor("apps/landing/src/content/beta/index.md"))).not.toBeNull();
  expect(readDraft(draftKeyFor("apps/landing/src/content/beta/start.md"))).toBeNull();
});

it("retains conflicting review links and prevents creating pages from an incomplete inventory", async () => {
  const claims = [1, 2].map((prNumber) => ({
    path: alphaPage.path,
    changeType: "modified" as const,
    prNumber,
    prUrl: `https://github.com/govtech-bb/gov-bb/pull/${prNumber}`,
    branch: `review-${prNumber}`,
    headSha: "sha",
    writable: true,
  }));
  content.openPRs = new Map([[alphaPage.path, claims]]);
  content.reviewSnapshot = { complete: false, claims };
  content.pages = [{ ...alphaPage, hasFormButton: false }];
  renderServices("/services?service=form%3Aalpha");
  await screen.findByRole("heading", { name: "Alpha service", level: 1 });
  expect(screen.queryByRole("link", { name: "Edit Alpha page" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add content page" })).toBeDisabled();
  expect(
    screen.getAllByRole("link", {
      name: /Review Alpha page in pull request/,
    }),
  ).toHaveLength(2);
});

it("distinguishes a failed inventory from an empty service library and retries both data sources", async () => {
  const user = userEvent.setup();
  forms.forms = null;
  forms.loadError = "Offline";
  content.pages = null;
  content.loadError = "Offline";
  renderServices();
  await screen.findByRole("heading", { name: "Services are unavailable" });
  expect(
    screen.queryByRole("heading", { name: "No services yet" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(forms.refetch).toHaveBeenCalledTimes(1);
  expect(content.refetch).toHaveBeenCalledTimes(1);
});

it("keeps pages visible when forms fail and offers a retry without reporting missing connections", async () => {
  const user = userEvent.setup();
  forms.forms = null;
  forms.loadError = "fetch failed";
  renderServices();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Forms could not be loaded.",
  );
  expect(screen.getByRole("link", { name: /Alpha page/ })).toHaveTextContent(
    "Forms unavailable",
  );
  expect(screen.queryByText("No form")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(forms.refetch).toHaveBeenCalledTimes(1);
  expect(content.refetch).toHaveBeenCalledTimes(1);
});

function seedService(snapshot: ServiceSnapshot) {
  localStorage.setItem(
    `service-workspace:v1:test:${snapshot.manifest.serviceId}`,
    JSON.stringify({
      ...snapshot,
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: "test",
    }),
  );
}

function pensionAdvice(): ServiceSnapshot {
  const base = emptyService("Pension advice");
  return appendServicePage(
    { ...base, manifest: { ...base.manifest, category: "education" } },
    startPageContentPath("pension-advice/index"),
    {
      ...EMPTY_PAGE,
      title: "Pension advice",
      slug: "pension-advice/index",
      category: "education",
    },
  );
}

it("shows the journey checklist and opens the next unfinished step", async () => {
  seedService(pensionAdvice());
  const user = userEvent.setup();
  renderServices("/services?service=pension-advice");
  const journey = await screen.findByRole("list", { name: "Journey" });
  expect(within(journey).getAllByRole("listitem")).toHaveLength(4);
  expect(within(journey).getByText("No content yet")).toBeInTheDocument();
  const details = screen.getByRole("list", { name: "Service details" });
  expect(within(details).getByText("Draft, hidden from the public")).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Continue: write the entry page" }),
  );
  await screen.findByRole("heading", { name: "Content editor" });
});

it("adds a start page and points the entry page's Start button at it", async () => {
  seedService(pensionAdvice());
  const user = userEvent.setup();
  renderServices("/services?service=pension-advice");
  await screen.findByRole("list", { name: "Journey" });
  await user.click(screen.getByRole("button", { name: "Add start page" }));
  await screen.findByRole("heading", { name: "Content editor" });
  const saved = JSON.parse(
    localStorage.getItem("service-workspace:v1:test:pension-advice")!,
  );
  expect(
    saved.manifest.pages.find((p: { kind: string }) => p.kind === "start"),
  ).toMatchObject({
    path: "apps/landing/src/content/pension-advice/start.md",
    publicPath: "/education/pension-advice/start",
  });
  const entry = saved.pages.find(
    (p: { id: string }) => p.id === saved.manifest.entryPoint,
  );
  expect(entry.body).toContain('href="/education/pension-advice/start"');
});

it("offers Publish once every step is done", async () => {
  const ready = pensionAdvice();
  ready.manifest.visibility = "preview";
  ready.manifest.contactDetails = { email: "help@example.test" };
  ready.pages[0] = {
    ...ready.pages[0]!,
    body: "## Overview\n\nWhat this service does.",
  };
  seedService(ready);
  renderServices("/services?service=pension-advice");
  expect(
    await screen.findByRole("button", { name: "Publish" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^Continue:/ }),
  ).not.toBeInTheDocument();
});

it("adopts a legacy service onto the same overview even when its form cannot be loaded", async () => {
  const base = emptyService("Alpha service");
  vi.mocked(
    loadServiceSource as unknown as (arg: unknown) => Promise<ServiceSnapshot>,
  ).mockResolvedValueOnce({
    ...base,
    manifest: {
      ...base.manifest,
      serviceId: "alpha",
      formId: "alpha",
      entryPoint: "form",
    },
  });
  renderServices("/services?service=form%3Aalpha");
  const journey = await screen.findByRole("list", { name: "Journey" });
  expect(
    within(journey).getByText("The connected form could not be loaded"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue: add the entry page" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Service draft unavailable"),
  ).not.toBeInTheDocument();
});
