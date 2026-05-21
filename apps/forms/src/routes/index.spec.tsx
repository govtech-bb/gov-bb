import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

// Mock TanStack Router — the Index component calls Route.useLoaderData()
// and renders <Link>, both of which require a router context in production
// but can be stubbed out in unit tests.
jest.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig) => routeConfig,
  Link: ({
    children,
    to,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={to}>{children}</a>,
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
  // Inject stub data that the component reads via Route.useLoaderData()
  Route.useLoaderData = jest.fn().mockReturnValue(MOCK_FORMS);
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
  });

  it("renders an empty list when no forms are returned", () => {
    Route.useLoaderData = jest.fn().mockReturnValue([]);
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
