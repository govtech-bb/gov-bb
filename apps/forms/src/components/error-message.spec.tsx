import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import ErrorMessage from "./error-message";

describe("ErrorMessage", () => {
  it("associates the message and hidden error prefix with its input", () => {
    render(
      <>
        <label htmlFor="email">Email</label>
        <input id="email" aria-describedby="email-error" />
        <ErrorMessage id="email-error" message="This field is required" />
      </>,
    );
    expect(screen.getByText("This field is required")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Email" }),
    ).toHaveAccessibleDescription(/^Error:\s*This field is required$/);
    expect(screen.getByText("Error:")).toHaveClass("govbb-visually-hidden");
  });

  it("applies the govbb-error-message class with a polite status role (#320)", () => {
    render(<ErrorMessage message="Error text" />);
    const el = screen.getByRole("status");
    expect(el).toHaveClass("govbb-error-message");
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
