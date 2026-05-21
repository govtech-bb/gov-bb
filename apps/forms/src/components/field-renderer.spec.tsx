import React from "react";
import { render } from "@testing-library/react";
import FieldRenderer from "./field-renderer";
import type { ClientPrimitive } from "@forms/types";

const mockFieldApi = {
  state: { value: undefined, meta: { isValid: true, errors: [] } },
  handleBlur: jest.fn(),
  handleChange: jest.fn(),
};

const mockForm = {
  Field: ({
    children,
  }: {
    name: string;
    validators?: unknown;
    children: (f: typeof mockFieldApi) => React.ReactNode;
  }) => <>{children(mockFieldApi)}</>,
  getFieldValue: jest.fn().mockReturnValue(undefined),
};

function primitive(
  htmlType: ClientPrimitive["htmlType"],
  overrides: Partial<ClientPrimitive> = {},
): ClientPrimitive {
  return {
    id: `step-1.${htmlType}-field`,
    fieldId: `${htmlType}-field`,
    stepId: "step-1",
    name: `${htmlType}-field`,
    label: `${htmlType} label`,
    htmlType,
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    behaviours: [],
    ...overrides,
  };
}

const noValidation = {};

describe("FieldRenderer", () => {
  beforeEach(() => jest.clearAllMocks());

  it("text → renders an input element", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("text")}
        validationProperties={noValidation}
      />,
    );
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("textarea → renders a textarea element", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("textarea")}
        validationProperties={noValidation}
      />,
    );
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("select → renders a select element", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("select", { options: [{ value: "a", label: "A" }] })}
        validationProperties={noValidation}
      />,
    );
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("radio → renders radio inputs", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("radio", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        })}
        validationProperties={noValidation}
      />,
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("checkbox → renders checkbox inputs", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("checkbox", {
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        })}
        validationProperties={noValidation}
      />,
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("date → renders three number inputs (day/month/year)", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("date")}
        validationProperties={noValidation}
      />,
    );
    const inputs = container.querySelectorAll('input[type="number"]');
    expect(inputs).toHaveLength(3);
  });

  it("file → renders a file input", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("file")}
        validationProperties={noValidation}
      />,
    );
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("hidden field → renders nothing", () => {
    const { container } = render(
      <FieldRenderer
        form={mockForm}
        field={primitive("text", { hidden: true })}
        validationProperties={noValidation}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("unsupported htmlType → renders fallback without throwing", () => {
    expect(() =>
      render(
        <FieldRenderer
          form={mockForm}
          field={primitive("unknown-xyz" as ClientPrimitive["htmlType"])}
          validationProperties={noValidation}
        />,
      ),
    ).not.toThrow();
  });
});
