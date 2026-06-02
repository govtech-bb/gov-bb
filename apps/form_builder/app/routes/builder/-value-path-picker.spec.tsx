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
  },
  {
    fieldId: "full-name",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Name › Full name",
    childFieldId: "full-name",
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

it("renders extraOptions as `label (value)` and makes them selectable", async () => {
  const onChange = jest.fn();
  render(
    <ValuePathPicker
      value=""
      fields={FIELDS}
      onChange={onChange}
      extraOptions={[{ value: "contactDetails.email", label: "MDA contact email" }]}
    />,
  );
  expect(
    screen.getByRole("option", { name: "MDA contact email (contactDetails.email)" }),
  ).toHaveValue("contactDetails.email");
  await userEvent.selectOptions(
    screen.getByRole("combobox"),
    "contactDetails.email",
  );
  expect(onChange).toHaveBeenCalledWith("contactDetails.email");
});

it("drops an extra option that collides with a real field path", () => {
  const collidingFields: ResolvedFieldId[] = [
    {
      fieldId: "email",
      editorFieldId: "e1",
      stepId: "contactDetails",
      stepTitle: "Contact Details",
      display: "Email",
    },
  ];
  render(
    <ValuePathPicker
      value=""
      fields={collidingFields}
      onChange={() => {}}
      extraOptions={[{ value: "contactDetails.email", label: "MDA contact email" }]}
    />,
  );
  // The field option wins; the extra option is dropped, so the value is unique.
  const options = screen.getAllByRole("option");
  expect(
    options.filter((o) => (o as HTMLOptionElement).value === "contactDetails.email"),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("option", { name: /MDA contact email/ }),
  ).not.toBeInTheDocument();
});

it("does not duplicate an extra option against the `(current)` fallback", () => {
  render(
    <ValuePathPicker
      value="contactDetails.email"
      fields={FIELDS}
      onChange={() => {}}
      extraOptions={[{ value: "contactDetails.email", label: "MDA contact email" }]}
    />,
  );
  // The extra option carries the value; no separate `(current)` option appears.
  expect(
    screen.getByRole("option", { name: "MDA contact email (contactDetails.email)" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: /\(current\)/ }),
  ).not.toBeInTheDocument();
  const options = screen.getAllByRole("option");
  expect(
    options.filter((o) => (o as HTMLOptionElement).value === "contactDetails.email"),
  ).toHaveLength(1);
});
