import React from "react";
import { render, screen, within } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (routeConfig: any) => routeConfig,
  Outlet: () => <div data-testid="outlet" />,
  HeadContent: () => <div data-testid="head-content" />,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtools: () => null,
}));

vi.mock("../components/not-found", () => ({
  default: () => <div data-testid="not-found" />,
}));

import { Route } from "./__root";

describe("__root Route", () => {
  it("matches landing's banner, header, alpha notice, main, and footer order", () => {
    const { container } = render(<Route.component />);
    expect(screen.getByTestId("head-content")).toBeInTheDocument();
    expect(screen.getByText("Official government website")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "https://alpha.gov.bb/what-we-mean-by-alpha",
    );
    expect(
      screen
        .getByRole("link", { name: "Alpha" })
        .closest(".govbb-status-banner"),
    ).toHaveClass(
      "govbb-status-banner--alpha",
      "govbb-status-banner--full-width",
    );
    const header = screen.getByRole("banner");
    const officialBanner = container.querySelector(".govbb-official-banner");
    const alphaBanner = container.querySelector(".govbb-status-banner");
    expect(header.parentElement).toHaveClass("print:hidden");
    expect(officialBanner?.parentElement).toBe(header.parentElement);
    expect(alphaBanner?.parentElement).toBe(header.parentElement);
    expect(
      Array.from(
        container.querySelectorAll(
          ".govbb-official-banner, header, .govbb-status-banner, main, footer",
        ),
      ),
    ).toEqual([
      officialBanner,
      header,
      alphaBanner,
      screen.getByRole("main"),
      screen.getByRole("contentinfo"),
    ]);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveClass(
      "govbb-footer",
      "print:hidden",
    );
  });

  it("keeps the official banner's image decorative and omits the learn-more link", () => {
    const { container } = render(<Route.component />);
    const banner = container.querySelector(".govbb-official-banner")!;
    expect(banner.querySelector("img")).toHaveAttribute(
      "src",
      "/images/coat-of-arms.png",
    );
    expect(banner.querySelector("img")).toHaveAttribute("alt", "");
    expect(banner.querySelector("a")).toBeNull();
    expect(banner.parentElement).toHaveClass("print:hidden");
  });

  it("links the header logo to the landing app without adding navigation", () => {
    render(<Route.component />);
    const header = within(screen.getByRole("banner"));
    const home = header.getByRole("link", {
      name: "Go to the alpha.gov.bb homepage",
    });
    expect(home).toHaveAttribute("href", "https://alpha.gov.bb");
    expect(header.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("govbb-logo.svg"),
    );
    expect(header.queryByRole("button")).not.toBeInTheDocument();
    expect(header.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders the skip link first and targets the main landmark", () => {
    const { container } = render(<Route.component />);
    const skipLink = screen.getByRole("link", {
      name: /skip to main content/i,
    });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(skipLink).toHaveClass("govbb-skip-link", "print:hidden");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(container.querySelector("a")).toBe(skipLink);
  });

  it("preserves footer destinations, coat of arms, and current-year copyright", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"));
    try {
      render(<Route.component />);
      const footer = screen.getByRole("contentinfo");
      expect(within(footer).getAllByRole("link")).toHaveLength(2);
      expect(
        within(footer).getByRole("link", { name: "Home" }),
      ).toHaveAttribute("href", "https://alpha.gov.bb/");
      expect(
        within(footer).getByRole("link", { name: "Terms & Conditions" }),
      ).toHaveAttribute("href", "https://alpha.gov.bb/terms-conditions");
      expect(footer.querySelector("img")).toHaveAttribute(
        "src",
        "/images/coat-of-arms.png",
      );
      expect(
        within(footer).getByText("© 2026 Government of Barbados"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the NotFound component", () => {
    const NotFoundComponent = Route.notFoundComponent as React.ComponentType;
    render(<NotFoundComponent />);
    expect(screen.getByTestId("not-found")).toBeInTheDocument();
  });
});
