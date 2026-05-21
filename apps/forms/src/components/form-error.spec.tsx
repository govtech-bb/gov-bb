import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "jest-axe";
import { FormFetchError } from "@forms/form-api";
import FormError from "./form-error";

describe("FormError", () => {
  const noopReset = () => {};

  describe("when error is a FormFetchError with status 404", () => {
    it('renders the "Form not found" heading', () => {
      const error = new FormFetchError("Not found", 404);
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByRole("heading", { name: "Form not found" }),
      ).toBeInTheDocument();
    });

    it("renders the 404 suggestion text", () => {
      const error = new FormFetchError("Not found", 404);
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByText(
          "Check the URL and try again, or return to the homepage.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("when error is a FormFetchError with status 0 (network error)", () => {
    it('renders the "Connection error" heading', () => {
      const error = new FormFetchError("Network failure", 0);
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByRole("heading", { name: "Connection error" }),
      ).toBeInTheDocument();
    });

    it("renders the network error suggestion text", () => {
      const error = new FormFetchError("Network failure", 0);
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByText(
          "Unable to reach the server. Check your connection and try again.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("when error is a generic Error", () => {
    it('renders the "Something went wrong" heading', () => {
      const error = new Error("Unexpected");
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByRole("heading", { name: "Something went wrong" }),
      ).toBeInTheDocument();
    });

    it("renders the generic suggestion text", () => {
      const error = new Error("Unexpected");
      render(<FormError error={error} reset={noopReset} />);
      expect(
        screen.getByText(
          "An unexpected error occurred while loading the form.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders the error message string", () => {
    const error = new Error("Something broke badly");
    render(<FormError error={error} reset={noopReset} />);
    expect(screen.getByText("Something broke badly")).toBeInTheDocument();
  });

  it('renders a "Try again" button that calls reset when clicked', () => {
    const reset = jest.fn();
    const error = new Error("Oops");
    render(<FormError error={error} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders a "Go to Homepage" link pointing to "/"', () => {
    const error = new Error("Oops");
    render(<FormError error={error} reset={noopReset} />);
    expect(
      screen.getByRole("link", { name: "Go to Homepage" }),
    ).toHaveAttribute("href", "/");
  });

  it("passes axe accessibility audit", async () => {
    const error = new FormFetchError("Not found", 404);
    const { container } = render(<FormError error={error} reset={noopReset} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
