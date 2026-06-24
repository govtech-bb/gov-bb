import type { Mock } from "vitest";
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
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig) => ({
    ...routeConfig,
    useLoaderData: vi.fn(),
  }),
  // Mirror redirect()'s throw-shape: a tagged object carrying the options, so
  // beforeLoad tests can `throw`/catch it and assert the external href.
  redirect: vi.fn((opts) => ({ isRedirect: true, options: opts })),
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

// getHomeUrl is the single env read for the index redirect. Mock it so each
// test controls whether a home URL is configured (staging/prod) or not (local).
vi.mock("../lib/env", () => ({
  getHomeUrl: vi.fn(),
}));
import { getHomeUrl } from "../lib/env";
const mockGetHomeUrl = getHomeUrl as Mock;

// Stub the loader so we control the data returned by useLoaderData().
// The real loader fetches from an API server that won't be available in Jest.
vi.mock("@forms/form-api", () => ({
  fetchFormDefinitions: vi.fn(),
}));

// After the mocks are in place, import the route module so that
// createFileRoute (already mocked) captures the component reference.
// We also need to patch useLoaderData onto Route before rendering.
import { Route, groupFormsByCategory } from "./index";

const MOCK_FORMS = [
  { formId: "form-1", title: "Passport Renewal", category: "Immigration" },
  { formId: "form-2", title: "Driver's Licence", category: "Transport" },
  { formId: "form-3", title: "Uncategorised Form" },
];

beforeEach(() => {
  vi.spyOn(Route, "useLoaderData").mockReturnValue(MOCK_FORMS);
  // Default: no home URL configured (local dev) → index renders, no redirect.
  mockGetHomeUrl.mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Index route", () => {
  it("renders without crashing", () => {
    const { container } = render(<Route.component />);
    expect(container).not.toBeEmptyDOMElement();
  });

  it("displays the page heading", () => {
    render(<Route.component />);
    expect(
      screen.getByRole("heading", { level: 1, name: /forms/i }),
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
    vi.spyOn(Route, "useLoaderData").mockReturnValue([]);
    render(<Route.component />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("groups forms under a category heading", () => {
    render(<Route.component />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Immigration" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Transport" }),
    ).toBeInTheDocument();
  });

  it("places forms without a category under 'Unknown Category'", () => {
    render(<Route.component />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Unknown Category" }),
    ).toBeInTheDocument();
  });

  it("orders categories alphabetically with 'Unknown Category' last", () => {
    render(<Route.component />);
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Immigration", "Transport", "Unknown Category"]);
  });

  it("passes jest-axe accessibility audit", async () => {
    const { container } = render(<Route.component />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("Index route redirect (beforeLoad)", () => {
  it("redirects to the configured home URL when one is set", () => {
    mockGetHomeUrl.mockReturnValue("https://staging.alpha.gov.bb");

    // beforeLoad throws the redirect; catch it and assert the external href.
    let thrown: unknown;
    try {
      Route.beforeLoad?.({} as never);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toMatchObject({
      isRedirect: true,
      options: { href: "https://staging.alpha.gov.bb", replace: true },
    });
  });

  it("does not redirect (renders the index) when no home URL is set", () => {
    mockGetHomeUrl.mockReturnValue(undefined);
    expect(() => Route.beforeLoad?.({} as never)).not.toThrow();
  });
});

describe("groupFormsByCategory", () => {
  it("returns an empty array for no forms", () => {
    expect(groupFormsByCategory([])).toEqual([]);
  });

  it("groups forms by their category", () => {
    const result = groupFormsByCategory([
      { formId: "a", title: "A", category: "Health" },
      { formId: "b", title: "B", category: "Health" },
      { formId: "c", title: "C", category: "Transport" },
    ]);
    expect(result).toEqual([
      {
        category: "Health",
        forms: [
          { formId: "a", title: "A", category: "Health" },
          { formId: "b", title: "B", category: "Health" },
        ],
      },
      {
        category: "Transport",
        forms: [{ formId: "c", title: "C", category: "Transport" }],
      },
    ]);
  });

  it("buckets forms with a missing or blank category under 'Unknown Category', sorted last", () => {
    const result = groupFormsByCategory([
      { formId: "a", title: "A" },
      { formId: "b", title: "B", category: "   " },
      { formId: "c", title: "C", category: "Transport" },
    ]);
    expect(result.map((g) => g.category)).toEqual([
      "Transport",
      "Unknown Category",
    ]);
    expect(result[1].forms.map((f) => f.formId)).toEqual(["a", "b"]);
  });
});
