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

jest.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (routeConfig: any) => routeConfig,
  Outlet: () => <div data-testid="outlet" />,
}));

jest.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

jest.mock("@forms/components", () => ({
  NotFound: () => <div data-testid="not-found" />,
}));

import { Route } from "./__root";

describe("__root Route", () => {
  describe("Route.component (RootLayout)", () => {
    it("is defined and is a function", () => {
      expect(Route.component).toBeDefined();
      expect(typeof Route.component).toBe("function");
    });

    it("renders without crashing", () => {
      const { container } = render(<Route.component />);
      expect(container).not.toBeEmptyDOMElement();
    });

    it("renders the Outlet placeholder", () => {
      render(<Route.component />);
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
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
