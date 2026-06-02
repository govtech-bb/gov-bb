import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldRenderer from "./field-renderer";
import type { ClientPrimitive } from "@forms/types";

// ---------------------------------------------------------------------------
// Mock @forms/lib so we can control checkConditionalOn's return value
// ---------------------------------------------------------------------------
jest.mock("@forms/lib", () => ({
  checkConditionalOn: jest.fn(),
}));

import { checkConditionalOn } from "@forms/lib";

const mockCheckConditionalOn = checkConditionalOn as jest.MockedFunction<
  typeof checkConditionalOn
>;

// ---------------------------------------------------------------------------
// Mutable field-api state — reassign mockState between tests
// ---------------------------------------------------------------------------
let mockState: { value: unknown; meta: { isValid: boolean; errors: any[] } } = {
  value: undefined,
  meta: { isValid: true, errors: [] },
};

const mockFieldApi = {
  get state() {
    return mockState;
  },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderField(
  field: ClientPrimitive,
  extra: Partial<React.ComponentProps<typeof FieldRenderer>> = {},
) {
  return render(
    <FieldRenderer
      form={mockForm}
      field={field}
      validationProperties={noValidation}
      {...extra}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("FieldRenderer", () => {
  beforeEach(() => {
    mockState = { value: undefined, meta: { isValid: true, errors: [] } };
    jest.clearAllMocks();
    // Default: checkConditionalOn returns "required" (field is shown)
    mockCheckConditionalOn.mockReturnValue("required");
  });

  // -------------------------------------------------------------------------
  // Existing tests (preserved unchanged)
  // -------------------------------------------------------------------------
  it("text → renders an input element", () => {
    const { container } = renderField(primitive("text"));
    expect(container.querySelector("input")).toBeTruthy();
  });

  it("textarea → renders a textarea element", () => {
    const { container } = renderField(primitive("textarea"));
    expect(container.querySelector("textarea")).toBeTruthy();
  });

  it("select → renders a select element", () => {
    const { container } = renderField(
      primitive("select", { options: [{ value: "a", label: "A" }] }),
    );
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("radio → renders radio inputs", () => {
    const { container } = renderField(
      primitive("radio", {
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      }),
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("checkbox → renders checkbox inputs", () => {
    const { container } = renderField(
      primitive("checkbox", {
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("date → renders three text inputs (day/month/year)", () => {
    const { container } = renderField(primitive("date"));
    const inputs = container.querySelectorAll('input[type="text"]');
    expect(inputs).toHaveLength(3);
  });

  it("file → renders a file input", () => {
    const { container } = renderField(primitive("file"));
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("hidden field → renders nothing", () => {
    const { container } = renderField(primitive("text", { hidden: true }));
    expect(container).toBeEmptyDOMElement();
  });

  it("unsupported htmlType → renders fallback without throwing", () => {
    expect(() =>
      renderField(primitive("unknown-xyz" as ClientPrimitive["htmlType"])),
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // show-hide
  // -------------------------------------------------------------------------
  describe("show-hide htmlType", () => {
    it("renders a toggle button with aria-expanded=false by default", () => {
      const { container } = renderField(primitive("show-hide"));
      const button = container.querySelector(".form-page__show-hide-toggle");
      expect(button).toBeTruthy();
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("clicking the toggle calls handleChange(!isOpen)", async () => {
      const user = userEvent.setup();
      const { container } = renderField(primitive("show-hide"));
      const button = container.querySelector(
        ".form-page__show-hide-toggle",
      ) as HTMLButtonElement;
      await user.click(button);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(true);
    });

    it("when value is true, aria-expanded is true", () => {
      mockState = { value: true, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("show-hide"));
      const button = container.querySelector(".form-page__show-hide-toggle");
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("clicking toggle when already open calls handleChange(false)", async () => {
      const user = userEvent.setup();
      mockState = { value: true, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("show-hide"));
      const button = container.querySelector(
        ".form-page__show-hide-toggle",
      ) as HTMLButtonElement;
      await user.click(button);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // fieldArray behaviour
  // -------------------------------------------------------------------------
  describe("fieldArray behaviour (type=text)", () => {
    const fieldArrayBehaviour = { type: "fieldArray" as const, min: 1, max: 3 };

    it("shows 'Add Another' when count < max", () => {
      mockState = { value: ["first"], meta: { isValid: true, errors: [] } };
      renderField(primitive("text", { behaviours: [fieldArrayBehaviour] }));
      expect(screen.getByText(/Add Another/i)).toBeTruthy();
    });

    it("clicking 'Add Another' calls handleChange with a new empty trailing entry", async () => {
      const user = userEvent.setup();
      mockState = { value: ["first"], meta: { isValid: true, errors: [] } };
      renderField(primitive("text", { behaviours: [fieldArrayBehaviour] }));
      await user.click(screen.getByText(/Add Another/i));
      // Asserting the exact new array catches regressions where the handler
      // is called with the wrong shape (e.g. undefined, a non-extended array,
      // or a stale snapshot).
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["first", ""]);
    });

    it("with 2 values shows a 'Remove' button on the last entry", () => {
      mockState = {
        value: ["first", "second"],
        meta: { isValid: true, errors: [] },
      };
      renderField(primitive("text", { behaviours: [fieldArrayBehaviour] }));
      expect(screen.getByText(/Remove/i)).toBeTruthy();
    });

    it("clicking 'Remove' calls handleChange with the trailing entry dropped", async () => {
      const user = userEvent.setup();
      mockState = {
        value: ["first", "second"],
        meta: { isValid: true, errors: [] },
      };
      renderField(primitive("text", { behaviours: [fieldArrayBehaviour] }));
      await user.click(screen.getByText(/Remove/i));
      // Pin the exact post-remove value so a regression that drops the
      // wrong entry, clears the array, or passes undefined is caught.
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["first"]);
    });

    it("at max count, 'Add Another' is not shown", () => {
      mockState = {
        value: ["a", "b", "c"],
        meta: { isValid: true, errors: [] },
      };
      renderField(primitive("text", { behaviours: [fieldArrayBehaviour] }));
      expect(screen.queryByText(/Add Another/i)).toBeNull();
    });

    it("typing in an array input calls handleChange", async () => {
      const user = userEvent.setup();
      mockState = { value: [""], meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("text", { behaviours: [fieldArrayBehaviour] }),
      );
      const input = container.querySelector("input") as HTMLInputElement;
      await user.type(input, "hello");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });

    it("when value is undefined, renders exactly min inputs using defaultValue", () => {
      mockState = { value: undefined, meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("text", {
          behaviours: [fieldArrayBehaviour],
          defaultValue: "default",
        }),
      );
      const inputs = container.querySelectorAll("input");
      // fieldArrayBehaviour has min: 1 — assert the exact count so a
      // regression that rendered max or every defaultValue entry is caught.
      expect(inputs.length).toBe(1);
    });

    it("'Add Another' button exposes the field label to assistive tech", () => {
      mockState = { value: ["first"], meta: { isValid: true, errors: [] } };
      renderField(
        primitive("text", {
          label: "Address line",
          behaviours: [fieldArrayBehaviour],
        }),
      );
      // Sighted users see "Add Another"; the field label is appended via a
      // visually-hidden span so screen readers know what is being added.
      expect(
        screen.getByRole("button", { name: "Add Another Address line" }),
      ).toBeInTheDocument();
    });

    it("'Remove' button exposes the field label to assistive tech", () => {
      mockState = {
        value: ["first", "second"],
        meta: { isValid: true, errors: [] },
      };
      renderField(
        primitive("text", {
          label: "Address line",
          behaviours: [fieldArrayBehaviour],
        }),
      );
      expect(
        screen.getByRole("button", { name: "Remove Address line" }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // number / tel / email htmlType (same code path as text)
  // -------------------------------------------------------------------------
  describe("number, tel, email htmlType", () => {
    it.each(["number", "tel", "email"] as ClientPrimitive["htmlType"][])(
      "%s → renders an input element",
      (htmlType) => {
        const { container } = renderField(primitive(htmlType));
        expect(container.querySelector("input")).toBeTruthy();
      },
    );
  });

  // -------------------------------------------------------------------------
  // fieldConditionalOn behaviour
  // -------------------------------------------------------------------------
  describe("fieldConditionalOn behaviour", () => {
    const conditionalBehaviour = { type: "fieldConditionalOn" as any };

    it("returns null when checkConditionalOn returns 'notRequired'", () => {
      mockCheckConditionalOn.mockReturnValue("notRequired");
      const { container } = renderField(
        primitive("text", { behaviours: [conditionalBehaviour] }),
      );
      expect(container).toBeEmptyDOMElement();
    });

    it("renders normally when checkConditionalOn returns 'required'", () => {
      mockCheckConditionalOn.mockReturnValue("required");
      const { container } = renderField(
        primitive("text", { behaviours: [conditionalBehaviour] }),
      );
      expect(container.querySelector("input")).toBeTruthy();
    });

    it("renders normally when checkConditionalOn returns 'unknownState'", () => {
      mockCheckConditionalOn.mockReturnValue("unknownState");
      const { container } = renderField(
        primitive("text", { behaviours: [conditionalBehaviour] }),
      );
      expect(container.querySelector("input")).toBeTruthy();
    });

    it("resets conditionallyHidden to false when field was previously hidden but now shown", () => {
      mockCheckConditionalOn.mockReturnValue("required");
      const field = primitive("text", {
        behaviours: [conditionalBehaviour],
        conditionallyHidden: true,
      });
      renderField(field);
      expect(field.conditionallyHidden).toBe(false);
    });

    it("sets conditionallyHidden to true when notRequired", () => {
      mockCheckConditionalOn.mockReturnValue("notRequired");
      const field = primitive("text", { behaviours: [conditionalBehaviour] });
      renderField(field);
      expect(field.conditionallyHidden).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  describe("error state", () => {
    it("shows error message when isValid=false", () => {
      mockState = {
        value: undefined,
        meta: { isValid: false, errors: ["required"] },
      };
      const { container } = renderField(primitive("text"));
      // ErrorMessage component is rendered; check it contains the error text
      expect(container.textContent).toContain("required");
    });

    it("shows no error message when isValid=true", () => {
      mockState = { value: undefined, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("text"));
      // No error class/content from ErrorMessage for valid state
      expect(container.textContent).not.toContain("required");
    });
  });

  // -------------------------------------------------------------------------
  // Hint text
  // -------------------------------------------------------------------------
  describe("hint text", () => {
    it.each([
      "text",
      "textarea",
      "select",
      "radio",
      "checkbox",
      "date",
    ] as ClientPrimitive["htmlType"][])(
      "%s → shows hint paragraph when hint is provided",
      (htmlType) => {
        const field = primitive(htmlType, {
          hint: "This is a hint",
          options:
            htmlType === "select" ||
            htmlType === "radio" ||
            htmlType === "checkbox"
              ? [{ value: "a", label: "A" }]
              : undefined,
        });
        const { container } = renderField(field);
        const hint = container.querySelector(".govbb-hint");
        expect(hint).toBeTruthy();
        expect(hint?.textContent).toBe("This is a hint");
      },
    );
  });

  // -------------------------------------------------------------------------
  // Single-option checkbox (toggle behaviour)
  // -------------------------------------------------------------------------
  describe("checkbox with a single option", () => {
    const singleOption = [{ value: "agree", label: "I agree" }];

    it("renders a single checkbox input", () => {
      const { container } = renderField(
        primitive("checkbox", { options: singleOption }),
      );
      const inputs = container.querySelectorAll('input[type="checkbox"]');
      expect(inputs).toHaveLength(1);
    });

    it("clicking unchecked checkbox calls handleChange with the option value", async () => {
      const user = userEvent.setup();
      mockState = { value: "", meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("checkbox", { options: singleOption }),
      );
      const input = container.querySelector("input") as HTMLInputElement;
      await user.click(input);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith("agree");
    });

    it("clicking checked checkbox calls handleChange with empty string", async () => {
      const user = userEvent.setup();
      mockState = { value: "agree", meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("checkbox", { options: singleOption }),
      );
      const input = container.querySelector("input") as HTMLInputElement;
      await user.click(input);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith("");
    });
  });

  // -------------------------------------------------------------------------
  // Multi-option checkbox (toggle function)
  // -------------------------------------------------------------------------
  describe("checkbox with multiple options", () => {
    const multiOptions = [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
    ];

    it("clicking an unchecked option adds it to the selection", async () => {
      const user = userEvent.setup();
      mockState = { value: [], meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("checkbox", { options: multiOptions }),
      );
      const inputs = container.querySelectorAll("input");
      await user.click(inputs[0]);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["a"]);
    });

    it("clicking a checked option removes it from the selection", async () => {
      const user = userEvent.setup();
      mockState = { value: ["a", "b"], meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("checkbox", { options: multiOptions }),
      );
      const inputs = container.querySelectorAll("input");
      await user.click(inputs[0]);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["b"]);
    });
  });

  // -------------------------------------------------------------------------
  // Date onChange handlers
  // -------------------------------------------------------------------------
  describe("date field onChange handlers", () => {
    it("changing the day input calls handleChange with updated day", async () => {
      const user = userEvent.setup();
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      await user.clear(dayInput);
      await user.type(dayInput, "15");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });

    it("changing the month input calls handleChange with updated month", async () => {
      const user = userEvent.setup();
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const monthInput = dateParts[1].querySelector(
        "input",
      ) as HTMLInputElement;
      await user.clear(monthInput);
      await user.type(monthInput, "3");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });

    it("changing the year input calls handleChange with updated year", async () => {
      const user = userEvent.setup();
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const yearInput = dateParts[2].querySelector("input") as HTMLInputElement;
      await user.clear(yearInput);
      await user.type(yearInput, "2025");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });

    it("renders with empty inputs when value is undefined", () => {
      mockState = { value: undefined, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("date"));
      const inputs = container.querySelectorAll('input[type="text"]');
      inputs.forEach((input) => {
        expect((input as HTMLInputElement).value).toBe("");
      });
    });

    it("does not display 'null' when a part is null", () => {
      mockState = {
        value: { day: null, month: null, year: null },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const inputs = container.querySelectorAll('input[type="text"]');
      inputs.forEach((input) => {
        expect((input as HTMLInputElement).value).toBe("");
      });
    });

    it("does not display NaN when a part holds a non-numeric value", () => {
      mockState = {
        value: { day: NaN, month: NaN, year: NaN },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const inputs = container.querySelectorAll('input[type="text"]');
      inputs.forEach((input) => {
        expect((input as HTMLInputElement).value).toBe("");
      });
    });

    it("stores NaN (not undefined) when a non-number is entered so validation flags it", () => {
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      fireEvent.change(dayInput, { target: { value: "a" } });
      // NaN (not undefined) distinguishes invalid input from an empty field so
      // the date is validated as invalid rather than treated as not-yet-filled.
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith({
        day: NaN,
        month: 6,
        year: 2024,
      });
    });

    it("keeps invalid text when the stored value updates to NaN", () => {
      const field = primitive("date");
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container, rerender } = renderField(field);
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      fireEvent.change(dayInput, { target: { value: "33w" } });
      // Simulate the form propagating the parsed NaN back into field state.
      mockState = {
        value: { day: NaN, month: 6, year: 2024 },
        meta: { isValid: false, errors: ["invalid date"] },
      };
      rerender(
        <FieldRenderer
          form={mockForm}
          field={field}
          validationProperties={noValidation}
        />,
      );
      // The re-sync effect must not clobber the raw text (NaN === NaN).
      expect(dayInput.value).toBe("33w");
    });

    it("leaves the input as typed when a non-numeric character is entered", () => {
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      fireEvent.change(dayInput, { target: { value: "33w" } });
      // The raw text the user typed must stay until they edit it again,
      // rather than being cleared because it isn't a valid number.
      expect(dayInput.value).toBe("33w");
    });

    it("stores undefined (not 0) when a part is cleared", () => {
      mockState = {
        value: { day: 1, month: 6, year: 2024 },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const monthInput = dateParts[1].querySelector(
        "input",
      ) as HTMLInputElement;
      fireEvent.change(monthInput, { target: { value: "" } });
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith({
        day: 1,
        month: undefined,
        year: 2024,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Radio with inset fields
  // -------------------------------------------------------------------------
  describe("radio with insetFieldsByOption", () => {
    it("shows inset fields when the option matching the selection has inset entries", () => {
      mockState = { value: "yes", meta: { isValid: true, errors: [] } };

      const insetField = primitive("text", {
        id: "step-1.inset-field",
        fieldId: "inset-field",
        name: "inset-field",
        label: "Inset field label",
        htmlType: "text",
      });

      const insetFieldsByOption = new Map([
        ["yes", [{ field: insetField, validationProperties: noValidation }]],
      ]);

      const { container } = renderField(
        primitive("radio", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        { insetFieldsByOption },
      );

      expect(
        container.querySelector(".govbb-radio-item__conditional"),
      ).toBeTruthy();
    });

    it("does not show inset fields when a different option is selected", () => {
      mockState = { value: "no", meta: { isValid: true, errors: [] } };

      const insetField = primitive("text", {
        id: "step-1.inset-field",
        fieldId: "inset-field",
        name: "inset-field",
        label: "Inset field label",
        htmlType: "text",
      });

      const insetFieldsByOption = new Map([
        ["yes", [{ field: insetField, validationProperties: noValidation }]],
      ]);

      const { container } = renderField(
        primitive("radio", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
        { insetFieldsByOption },
      );

      expect(
        container.querySelector(".govbb-radio-item__conditional"),
      ).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // ui.hideLabel — visually hides the label/legend while keeping it in the DOM
  // so the accessible name (htmlFor / <legend> grouping) is preserved.
  // -------------------------------------------------------------------------
  describe("ui.hideLabel", () => {
    it("text → label is present and carries govbb-visually-hidden when set", () => {
      const { container } = renderField(
        primitive("text", { label: "Email address", ui: { hideLabel: true } }),
      );
      const label = container.querySelector(".govbb-label");
      expect(label).toBeTruthy();
      expect(label?.textContent).toBe("Email address");
      expect(label).toHaveClass("govbb-visually-hidden");
    });

    it("text → label has no govbb-visually-hidden when flag is unset", () => {
      const { container } = renderField(primitive("text"));
      const label = container.querySelector(".govbb-label");
      expect(label).toBeTruthy();
      expect(label).not.toHaveClass("govbb-visually-hidden");
    });

    it("radio → legend is present and carries govbb-visually-hidden when set", () => {
      const { container } = renderField(
        primitive("radio", {
          label: "Pick one",
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
          ui: { hideLabel: true },
        }),
      );
      const legend = container.querySelector(".govbb-fieldset__legend");
      expect(legend).toBeTruthy();
      expect(legend?.textContent).toBe("Pick one");
      expect(legend).toHaveClass("govbb-visually-hidden");
    });

    it("radio → legend has no govbb-visually-hidden when flag is unset", () => {
      const { container } = renderField(
        primitive("radio", {
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ],
        }),
      );
      const legend = container.querySelector(".govbb-fieldset__legend");
      expect(legend).toBeTruthy();
      expect(legend).not.toHaveClass("govbb-visually-hidden");
    });
  });
});
