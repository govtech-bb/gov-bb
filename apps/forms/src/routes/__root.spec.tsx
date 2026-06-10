/**
 * Unit tests for apps/forms/src/routes/__root.tsx
 *
 * Covers:
 * - Route.component (RootLayout) renders without crashing
 * - Route.component renders the <Outlet /> placeholder
 * - Route.notFoundComponent renders the <NotFound /> component
 * - Route.component is defined and is a function
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";

jest.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (routeConfig: any) => routeConfig,
  Outlet: () => <div data-testid="outlet" />,
  HeadContent: () => <div data-testid="head-content" />,
}));

jest.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

jest.mock("@forms/components", () => ({
  NotFound: () => <div data-testid="not-found" />,
}));

// Render banner/header to testids (not null) so a regression that drops
// either component from the layout is observable. SiteHeader's real
// implementation imports `Link` from @tanstack/react-router; mocking it
// here avoids that import (the historical "Element type invalid in
// SiteHeader" failure) while still letting us assert it was rendered.
jest.mock("../components/site-header", () => ({
  SiteHeader: () => <div data-testid="site-header" />,
}));

jest.mock("../components/official-banner", () => ({
  OfficialBanner: () => <div data-testid="official-banner" />,
}));

// The Footer mock captures its props so the RootLayout's wiring of links,
// logoSrc, and copyrightText is asserted — not just "Footer rendered".
const mockFooterProps = jest.fn();
jest.mock("@govtech-bb/react", () => ({
  Footer: (props: unknown) => {
    mockFooterProps(props);
    return <div data-testid="footer" />;
  },
}));

import { Route } from "./__root";

describe("__root Route", () => {
  beforeEach(() => {
    mockFooterProps.mockClear();
  });

  describe("Route.component (RootLayout)", () => {
    it("is defined and is a function", () => {
      expect(Route.component).toBeDefined();
      expect(typeof Route.component).toBe("function");
    });

    it("renders the official banner, site header, outlet, and footer", () => {
      render(<Route.component />);
      expect(screen.getByTestId("head-content")).toBeInTheDocument();
      expect(screen.getByTestId("official-banner")).toBeInTheDocument();
      expect(screen.getByTestId("site-header")).toBeInTheDocument();
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
      expect(screen.getByTestId("footer")).toBeInTheDocument();
    });

    it("renders a skip link that targets the main landmark (WCAG 2.4.1)", () => {
      const { container } = render(<Route.component />);
      const skipLink = screen.getByRole("link", {
        name: "Skip to main content",
      });
      expect(skipLink).toHaveAttribute("href", "#main-content");

      // The link must be the first focusable element so keyboard users reach
      // it before the banner/header, and its target id must exist.
      const focusables = container.querySelectorAll("a[href], main");
      expect(focusables[0]).toBe(skipLink);
      expect(container.querySelector("#main-content")?.tagName).toBe("MAIN");
    });

    it("passes axe accessibility audit", async () => {
      const { container } = render(<Route.component />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("wires the Footer with the expected links, logoSrc, and current-year copyright", () => {
      // Pin the clock so the copyrightText assertion is deterministic
      // (the layout reads new Date().getFullYear()).
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-05-22T12:00:00Z"));
      try {
        render(<Route.component />);
        expect(mockFooterProps).toHaveBeenCalledTimes(1);
        const props = mockFooterProps.mock.calls[0][0] as Record<
          string,
          unknown
        >;
        expect(props).toMatchObject({
          links: [
            { label: "Home", href: "/" },
            { label: "Terms & Conditions", href: "/terms-conditions" },
          ],
          logoSrc: "/images/coat-of-arms.png",
          logoAlt: "Barbados Coat of Arms",
          copyrightText: "© 2026 Government of Barbados",
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("Route.notFoundComponent", () => {
    it("is defined", () => {
      expect(Route.notFoundComponent).toBeDefined();
    });

    it("renders the NotFound component", () => {
      const NotFoundComponent = Route.notFoundComponent as React.ComponentType;
      render(<NotFoundComponent />);
      expect(screen.getByTestId("not-found")).toBeInTheDocument();
    });
  });
});
