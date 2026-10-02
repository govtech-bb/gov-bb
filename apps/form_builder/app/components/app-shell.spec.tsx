/** @vitest-environment jsdom */
import "@testing-library/jest-dom";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useBlocker,
} from "@tanstack/react-router";
import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor, within } from "../test/ui";
import { AppShell } from "./app-shell";

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function renderWorkspace(
  shouldBlock = () => false,
  initialEntry = "/services",
  service?: {
    key: string;
    title: string;
    formId?: string;
    pages?: { path: string; title: string }[];
  },
) {
  const askAI = vi.fn();
  function Page({ section }: { section: "services" | "builder" | "content" }) {
    useBlocker({ shouldBlockFn: shouldBlock, enableBeforeUnload: false });
    return (
      <AppShell
        section={section}
        service={service}
        user="editor"
        onToggleAssistant={askAI}
        assistantOpen={false}
      >
        <h1>{section} workspace</h1>
      </AppShell>
    );
  }
  const root = createRootRoute({ component: Outlet });
  const routes = (["services", "builder", "content"] as const).map((section) =>
    createRoute({
      getParentRoute: () => root,
      path: `/${section}`,
      component: () => <Page section={section} />,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return { router, askAI };
}

it("keeps the rail preference and theme across sections, and honors editor navigation blockers", async () => {
  const user = userEvent.setup();
  let blocked = false;
  const { router, askAI } = renderWorkspace(() => blocked);
  await screen.findByRole("heading", { name: "services workspace" });
  const navigation = screen.getByRole("navigation", { name: "Workspace" });
  expect(
    within(navigation).getByRole("link", { name: "Services" }),
  ).toHaveAttribute("aria-current", "page");
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  await user.click(screen.getByRole("button", { name: "Dark mode" }));
  expect(
    within(navigation).queryByRole("link", { name: "Builder" }),
  ).not.toBeInTheDocument();
  expect(
    within(navigation).queryByRole("link", { name: "Content" }),
  ).not.toBeInTheDocument();
  await act(() => router.navigate({ to: "/builder" }));
  await screen.findByRole("heading", { name: "builder workspace" });
  expect(
    screen.getByRole("button", { name: "Expand sidebar" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.getByRole("button", { name: "Light mode" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Ask AI" }));
  expect(askAI).toHaveBeenCalledTimes(1);
  blocked = true;
  await user.click(screen.getByRole("link", { name: "Services" }));
  expect(router.state.location.pathname).toBe("/builder");
  expect(
    screen.getByRole("heading", { name: "builder workspace" }),
  ).toBeInTheDocument();
  blocked = false;
  await user.click(screen.getByRole("link", { name: "Services" }));
  await screen.findByRole("heading", { name: "services workspace" });
  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
});

it("starts mobile navigation closed, isolates the workspace while open, and restores focus on Escape", async () => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...matchMedia(query),
    matches: query.includes("max-width"),
  }));
  const user = userEvent.setup();
  renderWorkspace(() => false, "/builder");
  await screen.findByRole("heading", { name: "builder workspace" });
  expect(
    screen.queryByRole("navigation", { name: "Workspace" }),
  ).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Workspace" });
  await user.click(trigger);
  const navigation = screen.getByRole("navigation", { name: "Workspace" });
  expect(screen.getByRole("main").parentElement).toHaveAttribute("inert");
  await waitFor(() =>
    expect(navigation).toContainElement(document.activeElement as HTMLElement),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(screen.getByRole("main").parentElement).not.toHaveAttribute("inert");
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close navigation" }));
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await user.click(
    within(screen.getByRole("navigation", { name: "Workspace" })).getByRole(
      "link",
      { name: "Services" },
    ),
  );
  await screen.findByRole("heading", { name: "services workspace" });
  expect(
    screen.queryByRole("navigation", { name: "Workspace" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
});

it("opens a service form directly and distinguishes its public pages", async () => {
  const service = {
    key: "housing",
    title: "Apply for housing",
    formId: "housing",
    pages: [
      { path: "housing/index.md", title: "Apply for housing" },
      { path: "housing/start.md", title: "Apply for housing" },
    ],
  };
  const { router } = renderWorkspace(() => false, "/services", service);
  await screen.findByRole("heading", { name: "services workspace" });
  const nav = screen.getByRole("navigation", { name: "Workspace" });
  expect(
    within(nav).getByRole("link", { name: "Entry page" }),
  ).toHaveAttribute("href", expect.stringContaining("index.md"));
  expect(within(nav).getByRole("link", { name: "Start page" })).toHaveAttribute(
    "href",
    expect.stringContaining("start.md"),
  );
  await userEvent.click(
    within(nav).getByRole("link", { name: "Application form" }),
  );
  await screen.findByRole("heading", { name: "builder workspace" });
  expect(router.state.location.pathname).toBe("/builder");
  expect(router.state.location.search).toMatchObject({
    formId: "housing",
    service: "housing",
  });
});
