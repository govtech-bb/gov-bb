import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { FormFetchError } from "@forms/form-api";
import { LANDING_URL } from "../config/landing";
import FormError from "./form-error";

describe("FormError", () => {
  const noopReset = () => {};

  describe("404 — form not found", () => {
    const renderNotFound = () =>
      render(
        <FormError
          error={new FormFetchError("Not found", 404)}
          reset={noopReset}
        />,
      );

    it('renders the "Form not found" heading', () => {
      renderNotFound();
      expect(
        screen.getByRole("heading", { level: 1, name: "Form not found" }),
      ).toBeInTheDocument();
    });

    it("renders the suggestions list", () => {
      renderNotFound();
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
      // A 404 is not transient — no point offering "Try again".
      expect(
        screen.queryByRole("button", { name: "Try again" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("connection error (status 0)", () => {
    it('renders the "Connection error" heading', () => {
      render(
        <FormError
          error={new FormFetchError("Network failure", 0)}
          reset={noopReset}
        />,
      );
      expect(
        screen.getByRole("heading", { level: 1, name: "Connection error" }),
      ).toBeInTheDocument();
    });

    it('"Try again" re-runs the loader via reset', async () => {
      const user = userEvent.setup();
      const reset = vi.fn();
      render(
        <FormError
          error={new FormFetchError("Network failure", 0)}
          reset={reset}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(reset).toHaveBeenCalledTimes(1);
    });
  });

  describe("generic error", () => {
    it('renders the "Something went wrong" heading', () => {
      render(<FormError error={new Error("Unexpected")} reset={noopReset} />);
      expect(
        screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
      ).toBeInTheDocument();
    });

    it('"Try again" calls reset', async () => {
      const user = userEvent.setup();
      const reset = vi.fn();
      render(<FormError error={new Error("Oops")} reset={reset} />);
      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("links to the homepage", () => {
      render(<FormError error={new Error("Oops")} reset={noopReset} />);
      expect(
        screen.getByRole("link", { name: "Return to homepage" }),
      ).toHaveAttribute("href", LANDING_URL);
    });
  });

  it("passes axe accessibility audit", async () => {
    // heading-order: h3 ("Suggestions") follows h1 without an h2 — this mirrors
    // the shared ErrorPage layout; excluded consistent with not-found.spec.tsx.
    const { container } = render(
      <FormError
        error={new FormFetchError("Not found", 404)}
        reset={noopReset}
      />,
    );
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
