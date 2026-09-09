import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
  RouterProvider,
} from "@tanstack/react-router";
import { axe } from "jest-axe";
import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";
import FormError from "./form-error";

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
});
