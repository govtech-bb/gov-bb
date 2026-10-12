import React from "react";
import { render, screen } from "@testing-library/react";
import FieldRenderer from ".";
import type { ClientPrimitive } from "@forms/types";

vi.mock("@forms/lib", () => ({
  checkConditionalOn: vi.fn().mockReturnValue("required"),
}));

function renderParish(value: string | undefined) {
  const fieldApi = {
    state: { value, meta: { isValid: true, errors: [] } },
    handleBlur: vi.fn(),
    handleChange: vi.fn(),
    validate: vi.fn(),
  };
  const form = {
    Field: ({
      children,
    }: {
      children: (f: typeof fieldApi) => React.ReactNode;
    }) => <>{children(fieldApi)}</>,
    getFieldValue: vi.fn(),
    setFieldValue: vi.fn(),
  };
  const field = {
    id: "event_event-parish",
    fieldId: "event-parish",
    stepId: "event",
    name: "event-parish",
    label: "Parish of event",
    htmlType: "select",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    options: [
      { value: "st-michael", label: "St. Michael" },
      { value: "st-george", label: "St. George" },
    ],
    filledByAddressLookup: true,
    validations: { required: { value: true, error: "Select the parish" } },
  } as ClientPrimitive;
  return render(
    <FieldRenderer form={form} field={field} validationProperties={{}} />,
  );
}

describe("a parish filled by a located address", () => {
  it("is shown but disabled, so it cannot be changed by hand", () => {
    renderParish("st-michael");

    const parish = screen.getByRole("combobox", { name: "Parish of event" });
    expect(parish).toBeDisabled();
    expect(parish).toHaveValue("st-michael");
    expect(parish).toHaveAttribute("data-value", "st-michael");
  });

  it("is empty and disabled until the address is located", () => {
    renderParish(undefined);
    const parish = screen.getByRole("combobox", { name: "Parish of event" });
    expect(parish).toBeDisabled();
    expect(parish).toHaveValue("");
  });
});
