import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

// Mock TanStack Router — the Index component calls Route.useLoaderData()
// and renders <Link>, both of which require a router context in production
// but can be stubbed out in unit tests.
//
// The Link mock preserves the `to` and `params` props on the rendered <a>
// via data-* attributes so tests can verify the component passes both
// (the real Link interpolates `params` into `to`). A simpler stub that
// only honoured `to` would silently allow a regression that drops
// `params={{ formId }}` to ship.
jest.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig) => ({
    ...routeConfig,
    useLoaderData: jest.fn(),
  }),
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={to}
      data-to={to}
      data-params={params ? JSON.stringify(params) : ""}
    >
      {children}
    </a>
  ),
}));

// Stub the loader so we control the data returned by useLoaderData().
// The real loader fetches from an API server that won't be available in Jest.
jest.mock("@forms/form-api", () => ({
  fetchFormDefinitions: jest.fn(),
}));

// After the mocks are in place, import the route module so that
// createFileRoute (already mocked) captures the component reference.
// We also need to patch useLoaderData onto Route before rendering.
import { Route } from "./index";

const MOCK_FORMS = [
  { formId: "form-1", title: "Passport Renewal" },
  { formId: "form-2", title: "Driver's Licence" },
];

beforeEach(() => {
  jest.spyOn(Route, "useLoaderData").mockReturnValue(MOCK_FORMS);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Index route", () => {
  it("renders without crashing", () => {
    const { container } = render(<Route.component />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it("displays the welcome heading", () => {
    render(<Route.component />);
    expect(
      screen.getByRole("heading", { name: /welcome govtech/i }),
    ).toBeInTheDocument();
  });

  it("renders a list item for each form definition", () => {
    render(<Route.component />);
    expect(screen.getByText("Passport Renewal")).toBeInTheDocument();
    expect(screen.getByText("Driver's Licence")).toBeInTheDocument();
    // Verify the Link is given BOTH the route pattern (`to`) and the
    // per-form `params`. Without the params assertion, dropping
    // `params={{ formId }}` from the source would not be caught — TanStack
    // Link would emit a broken URL in production while the stub Link's
    // href output still showed the literal pattern.
    const passportLink = screen.getByText("Passport Renewal").closest("a")!;
    expect(passportLink.getAttribute("data-to")).toBe("/forms/$formId");
    expect(
      JSON.parse(passportLink.getAttribute("data-params") || "{}"),
    ).toEqual({ formId: "form-1" });

    const driversLink = screen.getByText("Driver's Licence").closest("a")!;
    expect(JSON.parse(driversLink.getAttribute("data-params") || "{}")).toEqual(
      { formId: "form-2" },
    );
  });

  it("renders an empty list when no forms are returned", () => {
    jest.spyOn(Route, "useLoaderData").mockReturnValue([]);
    render(<Route.component />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("passes jest-axe accessibility audit", async () => {
    const { container } = render(<Route.component />);
    // heading-order: h3 without a preceding h1/h2 — pre-existing in the component;
    // excluded here consistent with the project convention (see submission-confirmation.spec.tsx).
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
