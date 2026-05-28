import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ErrorMessage from "./error-message";

describe("ErrorMessage", () => {
  it("renders the message string", () => {
    render(<ErrorMessage message="This field is required" />);
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("applies data-error attribute and a polite status role (#320)", () => {
    render(<ErrorMessage message="Error text" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("data-error");
    // Must not be assertive — inline errors should not interrupt per field.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders nothing when message is empty string", () => {
    const { container } = render(<ErrorMessage message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("passes axe accessibility audit", async () => {
    const { container } = render(<ErrorMessage message="Field required" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
