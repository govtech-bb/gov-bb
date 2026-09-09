/**
 * not-found.spec.tsx
 *
 * Covers:
 * - Renders the "We couldn't find that page" heading
 * - Renders "Go to Homepage" link pointing to the landing site
 * - Renders suggestions list with "Check the web address for typos"
 * - Renders "Return to the homepage" suggestion
 * - Passes jest-axe accessibility audit
 */

import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { LANDING_URL } from "../config/landing";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("renders the 'We couldn't find that page' heading", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /couldn.t find that page/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders 'Return to homepage' link pointing to the landing site", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /^return to homepage$/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", LANDING_URL);
  });

  it("renders 'Check the web address for typos' suggestion", () => {
    render(<NotFound />);
    expect(
      screen.getByText(/check the web address for typos/i),
    ).toBeInTheDocument();
  });

  it("renders 'Return to the homepage' suggestion", () => {
    render(<NotFound />);
    expect(screen.getByText(/return to the homepage/i)).toBeInTheDocument();
  });

  it("passes jest-axe accessibility audit", async () => {
    const { container } = render(<NotFound />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
