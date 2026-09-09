import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("preserves field order and message formatting, omitting empty errors", () => {
    const errors: FieldValidationErrors = {
      name: ["Name is required"],
      phone: [],
      email: ["Email is invalid", "Enter a work email"],
    };
    render(<ErrorSummary errors={errors} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Name is required");
    expect(items[1]).toHaveTextContent(
      "Email is invalid and Enter a work email",
    );
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

  it("keyboard activation focuses the linked input or field group", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ErrorSummary
          errors={{
            email: ["Email is required"],
            birthDate: ["Date is required"],
          }}
        />
        <label htmlFor="email">Email</label>
        <input id="email" />
        <fieldset id="birthDate">
          <legend>Date of birth</legend>
          <label htmlFor="day">Day</label>
          <input id="day" />
        </fieldset>
      </>,
    );

    const emailLink = screen.getByRole("link", { name: "Email is required" });
    expect(emailLink).toHaveAttribute("href", "#email");
    await user.tab();
    expect(emailLink).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();

    const dateLink = screen.getByRole("link", { name: "Date is required" });
    expect(dateLink).toHaveAttribute("href", "#birthDate");
    dateLink.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("group", { name: "Date of birth" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("textbox", { name: "Day" })).toHaveFocus();
  });

  it("passes axe accessibility audit", async () => {
    const errors: FieldValidationErrors = { name: ["Required"] };
    const { container } = render(<ErrorSummary errors={errors} />);
    expect(
      screen.getByRole("alert", { name: "There is a problem" }),
    ).toBeInTheDocument();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
