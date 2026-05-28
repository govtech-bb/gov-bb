import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ErrorMessage from "./error-message";

describe("ErrorMessage", () => {
  it("renders the message string with a visually-hidden Error: prefix", () => {
    render(<ErrorMessage message="This field is required" />);
    expect(screen.getByText(/This field is required/)).toBeInTheDocument();
    expect(screen.getByText("Error:")).toBeInTheDocument();
  });

  it("is not a live region and exposes data-error + id (#320, GOV.UK pattern)", () => {
    const { container } = render(
      <ErrorMessage id="field-1-error" message="Error text" />,
    );
    const p = container.querySelector("p[data-error]");
    expect(p).toHaveAttribute("id", "field-1-error");
    // No live role — announcement comes from the focus-managed ErrorSummary.
    expect(p).not.toHaveAttribute("role");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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
