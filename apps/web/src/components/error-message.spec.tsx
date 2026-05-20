import React from "react";
import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ErrorMessage from "./error-message";

describe("ErrorMessage", () => {
  it("renders the message string", () => {
    render(<ErrorMessage message="This field is required" />);
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("applies data-error attribute", () => {
    render(<ErrorMessage message="Error text" />);
    expect(screen.getByRole("alert")).toHaveAttribute("data-error");
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
