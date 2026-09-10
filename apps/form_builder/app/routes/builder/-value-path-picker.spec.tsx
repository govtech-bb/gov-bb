import { openSelect, chooseOption } from "../../test/select";
/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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
    isNumeric: false,
  },
  {
    fieldId: "full-name",
    editorFieldId: "e2",
    stepId: "applicant",
    stepTitle: "Applicant",
    display: "Name › Full name",
    childFieldId: "full-name",
    isBoolean: false,
    isNumeric: false,
  },
];

it("renders an option per resolved field with a `stepId.fieldId` value", async () => {
  render(<ValuePathPicker value="" fields={FIELDS} onChange={() => {}} />);
  await openSelect(screen.getByRole("combobox"));
  expect(screen.getByRole("option", { name: /Email/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /Full name/ })).toBeInTheDocument();
});

it("calls onChange with the selected `stepId.fieldId` path", async () => {
  const onChange = vi.fn();
  render(<ValuePathPicker value="" fields={FIELDS} onChange={onChange} />);
  await chooseOption(
    screen.getByRole("combobox"),
    new RegExp("\\(contact\\.email\\)$"),
  );
  await openSelect(screen.getByRole("combobox"));
  expect(onChange).toHaveBeenCalledWith("contact.email");
});

it("keeps an existing value selectable even when it matches no current field", async () => {
  render(
    <ValuePathPicker value="legacy.path" fields={FIELDS} onChange={() => {}} />,
  );
  await openSelect(screen.getByRole("combobox"));
  expect(screen.getByRole("combobox")).toHaveTextContent("legacy.path");
  expect(
    screen.getByRole("option", { name: /legacy\.path/ }),
  ).toBeInTheDocument();
});

it("renders extraOptions as `label (value)` and makes them selectable", async () => {
  const onChange = vi.fn();
  render(
    <ValuePathPicker
      value=""
      fields={FIELDS}
      onChange={onChange}
      extraOptions={[
        { value: "contactDetails.email", label: "MDA contact email" },
      ]}
    />,
  );
  await openSelect(screen.getByRole("combobox"));
  expect(
    screen.getByRole("option", {
      name: "MDA contact email (contactDetails.email)",
    }),
  ).toBeInTheDocument();
  await chooseOption(
    screen.getByRole("combobox"),
    new RegExp("\\(contactDetails\\.email\\)$"),
  );
  expect(onChange).toHaveBeenCalledWith("contactDetails.email");
});

it("drops an extra option that collides with a real field path", async () => {
  const collidingFields: ResolvedFieldId[] = [
    {
      fieldId: "email",
      editorFieldId: "e1",
      stepId: "contactDetails",
      stepTitle: "Contact Details",
      display: "Email",
      isBoolean: false,
      isNumeric: false,
    },
  ];
  render(
    <ValuePathPicker
      value=""
      fields={collidingFields}
      onChange={() => {}}
      extraOptions={[
        { value: "contactDetails.email", label: "MDA contact email" },
      ]}
    />,
  );
  await openSelect(screen.getByRole("combobox"));
  // The field option wins; the extra option is dropped, so the value is unique.
  const options = screen.getAllByRole("option");
  expect(
    options.filter((o) => o.textContent?.endsWith("(contactDetails.email)")),
  ).toHaveLength(1);
  expect(
    screen.queryByRole("option", { name: /MDA contact email/ }),
  ).not.toBeInTheDocument();
});

it("does not duplicate an extra option against the `(current)` fallback", async () => {
  render(
    <ValuePathPicker
      value="contactDetails.email"
      fields={FIELDS}
      onChange={() => {}}
      extraOptions={[
        { value: "contactDetails.email", label: "MDA contact email" },
      ]}
    />,
  );
  await openSelect(screen.getByRole("combobox"));
  // The extra option carries the value; no separate `(current)` option appears.
  expect(
    screen.getByRole("option", {
      name: "MDA contact email (contactDetails.email)",
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: /\(current\)/ }),
  ).not.toBeInTheDocument();
  const options = screen.getAllByRole("option");
  expect(
    options.filter((o) => o.textContent?.endsWith("(contactDetails.email)")),
  ).toHaveLength(1);
});
