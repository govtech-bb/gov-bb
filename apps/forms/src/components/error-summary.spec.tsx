import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ErrorSummary from "./error-summary";
import type { FieldValidationErrors } from "@forms/types";

describe("ErrorSummary", () => {
  it("renders nothing when errors object is empty", () => {
    const { container } = render(<ErrorSummary errors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when all error arrays are empty", () => {
    const { container } = render(
      <ErrorSummary errors={{ name: [], email: [] }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one list item per field with errors", () => {
    const errors: FieldValidationErrors = {
      name: ["Name is required"],
      email: ["Email is invalid"],
    };
    render(<ErrorSummary errors={errors} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("each list item contains the error message text", () => {
    const errors: FieldValidationErrors = {
      username: ["Must be at least 3 characters"],
    };
    render(<ErrorSummary errors={errors} />);
    expect(
      screen.getByText("Must be at least 3 characters"),
    ).toBeInTheDocument();
  });

  it("links navigate to the correct field anchor", () => {
    const errors: FieldValidationErrors = { email: ["Email is required"] };
    render(<ErrorSummary errors={errors} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "#email");
  });

  it("passes axe accessibility audit", async () => {
    const errors: FieldValidationErrors = { name: ["Required"] };
    const { container } = render(<ErrorSummary errors={errors} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
