import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
  RouterProvider,
} from "@tanstack/react-router";
import { axe } from "jest-axe";
import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";
import { trackEvent } from "../lib/analytics";
import FormError from "./form-error";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));

function renderError(error: unknown) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  });
  return render(
    <RouterContextProvider router={router}>
      <FormError error={error} reset={() => {}} />
    </RouterContextProvider>,
  );
}

describe("FormError", () => {
  describe("404 — form not found", () => {
    const renderNotFound = () =>
      renderError(new FormFetchError("Not found", 404));

    it('renders the "Form not found" heading', () => {
      renderNotFound();
      expect(
        screen.getByRole("heading", { level: 1, name: "Form not found" }),
      ).toBeInTheDocument();
    });

    it("renders the suggestions list", () => {
      renderNotFound();
      expect(
        screen.getByRole("heading", { level: 2, name: "Suggestions:" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Check the web address for typos"),
      ).toBeInTheDocument();
    });

    it("links to the homepage and the service directory, with no retry button", () => {
      renderNotFound();
      expect(
        screen.getByRole("link", { name: "Return to homepage" }),
      ).toHaveAttribute("href", LANDING_URL);
      expect(
        screen.getByRole("link", { name: "Browse our service directory" }),
      ).toHaveAttribute("href", `${LANDING_URL}/services`);
      expect(
        screen.queryByRole("button", { name: "Try again" }),
      ).not.toBeInTheDocument();
    });
  });

  it('renders the "Connection error" heading for network failures', () => {
    renderError(new FormFetchError("Network failure", 0));
    expect(
      screen.getByRole("heading", { level: 1, name: "Connection error" }),
    ).toBeInTheDocument();
  });

  it.each([new Error("Unexpected"), "Unexpected"])(
    "renders a generic message without exposing the caught value: %s",
    (error) => {
      renderError(error);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Something went wrong",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Unexpected")).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Return to homepage" }),
      ).toHaveAttribute("href", LANDING_URL);
    },
  );

  it.each([
    ["network", new FormFetchError("Network failure", 0)],
    ["generic", new Error("Unexpected")],
  ])(
    '"Try again" recovers from a failed %s query through the router',
    async (_, error) => {
      const user = userEvent.setup();
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const fetchForm = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue("loaded");
      const router = createRouter({
        history: createMemoryHistory(),
        routeTree: createRootRoute({
          loader: () =>
            queryClient.ensureQueryData({
              queryKey: ["form"],
              queryFn: fetchForm,
            }),
          errorComponent: FormError,
          component: () => <h1>Form loaded</h1>,
        }),
        defaultPendingMinMs: 0,
      });
      try {
        render(<RouterProvider router={router} />);
        await user.click(
          await screen.findByRole("button", { name: "Try again" }),
        );
        expect(
          await screen.findByRole("heading", { name: "Form loaded" }),
        ).toBeInTheDocument();
        expect(fetchForm).toHaveBeenCalledTimes(2);
      } finally {
        queryClient.clear();
      }
    },
  );

  it("passes axe accessibility audit", async () => {
    const { container } = renderError(new FormFetchError("Not found", 404));
    expect(await axe(container)).toHaveNoViolations();
  });

  describe("form-load-error event (#3513)", () => {
    beforeEach(() => vi.mocked(trackEvent).mockClear());

    // The form route's own loader fails, as on /forms/$formId.
    async function renderFormRouteError(error: unknown) {
      const rootRoute = createRootRoute();
      const formRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: "/forms/$formId",
        loader: () => {
          throw error;
        },
        errorComponent: FormError,
        component: () => null,
      });
      const router = createRouter({
        routeTree: rootRoute.addChildren([formRoute]),
        history: createMemoryHistory({
          initialEntries: ["/forms/test-form"],
        }),
      });
      render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      );
      await screen.findByRole("heading", { level: 1 });
    }

    it.each([
      ["network", new FormFetchError("Network failure", 0)],
      ["server", new FormFetchError("Server error", 500)],
      ["server", new Error("Unexpected")],
    ])("sends reason %s with the form, once", async (reason, error) => {
      await renderFormRouteError(error);
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("form-load-error", {
        form: "test-form",
        reason,
      });
    });

    it("leaves out a form that was not found: its id is typed text", async () => {
      await renderFormRouteError(new FormFetchError("Not found", 404));
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("form-load-error", {
        reason: "not-found",
      });
    });

    it("leaves the form out on a route with no form", async () => {
      const rootRoute = createRootRoute({
        loader: () => {
          throw new Error("Unexpected");
        },
        errorComponent: FormError,
      });
      render(
        <StrictMode>
          <RouterProvider
            router={createRouter({
              routeTree: rootRoute,
              history: createMemoryHistory(),
            })}
          />
        </StrictMode>,
      );
      await screen.findByRole("heading", { level: 1 });
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("form-load-error", {
        reason: "server",
      });
    });
  });
});
