/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResolvedFieldId } from "@govtech-bb/form-builder";
import { ValuePathPicker } from "./-value-path-picker";

const FIELDS: ResolvedFieldId[] = [
  {
    fieldId: "email",
    editorFieldId: "e1",
    stepId: "contact",
    stepTitle: "Contact",
    display: "Email",
    isBoolean: false,
  },
  {
    fieldId: "full-name",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Name › Full name",
    childFieldId: "full-name",
    isBoolean: false,
  },
];

it("renders an option per resolved field with a `stepId.fieldId` value", () => {
  render(<ValuePathPicker value="" fields={FIELDS} onChange={() => {}} />);
  expect(screen.getByRole("option", { name: /Email/ })).toHaveValue("contact.email");
  expect(screen.getByRole("option", { name: /Full name/ })).toHaveValue(
    "applicant.full-name",
  );
});

it("calls onChange with the selected `stepId.fieldId` path", async () => {
  const onChange = jest.fn();
  render(<ValuePathPicker value="" fields={FIELDS} onChange={onChange} />);
  await userEvent.selectOptions(screen.getByRole("combobox"), "contact.email");
  expect(onChange).toHaveBeenCalledWith("contact.email");
});

it("keeps an existing value selectable even when it matches no current field", () => {
  render(<ValuePathPicker value="legacy.path" fields={FIELDS} onChange={() => {}} />);
  expect(screen.getByRole("combobox")).toHaveValue("legacy.path");
  expect(
    screen.getByRole("option", { name: /legacy\.path/ }),
  ).toBeInTheDocument();
});
