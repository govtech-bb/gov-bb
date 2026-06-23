import type { Mock, MockedFunction } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import FieldRenderer from "./field-renderer";
import type { ClientPrimitive } from "@forms/types";

// ---------------------------------------------------------------------------
// Mock @forms/lib so we can control checkConditionalOn's return value
// ---------------------------------------------------------------------------
vi.mock("@forms/lib", () => ({
  checkConditionalOn: vi.fn(),
  // Mirror the real helper: digits only, empty -> undefined, never NaN.
  parseDatePart: (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    return digits === "" ? undefined : Number(digits);
  },
}));

import { checkConditionalOn } from "@forms/lib";

const mockCheckConditionalOn = checkConditionalOn as MockedFunction<
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
  handleBlur: vi.fn(),
  handleChange: vi.fn(),
};

const mockForm = {
  Field: ({
    children,
  }: {
    name: string;
    validators?: unknown;
    children: (f: typeof mockFieldApi) => React.ReactNode;
  }) => <>{children(mockFieldApi)}</>,
  getFieldValue: vi.fn().mockReturnValue(undefined),
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
    vi.clearAllMocks();
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

  it("date → renders three text inputs with numeric inputmode (day/month/year)", () => {
    const { container } = renderField(primitive("date"));
    const inputs = container.querySelectorAll('input[type="text"]');
    expect(inputs).toHaveLength(3);
    inputs.forEach((input) => {
      expect(input).toHaveAttribute("inputmode", "numeric");
    });
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
  // show-hide — native <details>/<summary> disclosure (#341)
  // -------------------------------------------------------------------------
  describe("show-hide htmlType", () => {
    const showHideSummary = (container: HTMLElement) =>
      container.querySelector(
        "details.govbb-show-hide > summary.govbb-show-hide__summary",
      ) as HTMLElement | null;

    it("renders a native <details> disclosure, collapsed by default", () => {
      const { container } = renderField(primitive("show-hide"));
      const details = container.querySelector("details.govbb-show-hide");
      expect(details).toBeTruthy();
      // Collapsed by default — no `open` attribute.
      expect(details).not.toHaveAttribute("open");
    });

    it("the summary carries the field label", () => {
      const { container } = renderField(
        primitive("show-hide", { label: "More details" }),
      );
      const summary = showHideSummary(container);
      expect(summary).toBeTruthy();
      expect(summary?.textContent).toContain("More details");
    });

    it("toggling the summary open commits true", async () => {
      const user = userEvent.setup();
      const { container } = renderField(primitive("show-hide"));
      await user.click(showHideSummary(container)!);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(true);
    });

    it("when value is true, the <details> is open", () => {
      mockState = { value: true, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("show-hide"));
      expect(
        container.querySelector("details.govbb-show-hide"),
      ).toHaveAttribute("open");
    });

    it("toggling the summary closed (when open) commits false", async () => {
      const user = userEvent.setup();
      mockState = { value: true, meta: { isValid: true, errors: [] } };
      const { container } = renderField(primitive("show-hide"));
      await user.click(showHideSummary(container)!);
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(false);
    });

    it("has no axe-detectable accessibility violations", async () => {
      const { container } = renderField(
        primitive("show-hide", { label: "More details" }),
      );
      expect(await axe(container)).toHaveNoViolations();
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
  // fieldArray behaviour (type=textarea) — #341 regression: a repeatable
  // textarea used to fall through into `case "text"` and render <input>.
  // -------------------------------------------------------------------------
  describe("fieldArray behaviour (type=textarea)", () => {
    const fieldArrayBehaviour = { type: "fieldArray" as const, min: 1, max: 3 };

    it("renders <textarea> elements, never <input>, in the array path", () => {
      mockState = { value: ["first"], meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("textarea", { behaviours: [fieldArrayBehaviour] }),
      );
      expect(container.querySelector("textarea")).toBeTruthy();
      // The regression rendered a masked <input>; assert it never reappears.
      expect(container.querySelector("input")).toBeNull();
    });

    it("shows 'Add Another' when count < max", () => {
      mockState = { value: ["first"], meta: { isValid: true, errors: [] } };
      renderField(primitive("textarea", { behaviours: [fieldArrayBehaviour] }));
      expect(screen.getByText(/Add Another/i)).toBeTruthy();
    });

    it("clicking 'Add Another' appends a new empty trailing entry (immutably)", async () => {
      const user = userEvent.setup();
      const original = ["first"];
      mockState = { value: original, meta: { isValid: true, errors: [] } };
      renderField(primitive("textarea", { behaviours: [fieldArrayBehaviour] }));
      await user.click(screen.getByText(/Add Another/i));
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["first", ""]);
      // TanStack dedupes by reference: a mutated-in-place array would be
      // dropped as "unchanged". Assert a fresh array is committed and the
      // stored value is left untouched.
      expect(mockFieldApi.handleChange.mock.calls[0][0]).not.toBe(original);
      expect(original).toEqual(["first"]);
    });

    it("clicking 'Remove' drops the trailing entry (immutably)", async () => {
      const user = userEvent.setup();
      const original = ["first", "second"];
      mockState = { value: original, meta: { isValid: true, errors: [] } };
      renderField(primitive("textarea", { behaviours: [fieldArrayBehaviour] }));
      await user.click(screen.getByText(/Remove/i));
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith(["first"]);
      expect(mockFieldApi.handleChange.mock.calls[0][0]).not.toBe(original);
      expect(original).toEqual(["first", "second"]);
    });

    it("when value is undefined, renders exactly min textareas", () => {
      mockState = { value: undefined, meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("textarea", { behaviours: [fieldArrayBehaviour] }),
      );
      expect(container.querySelectorAll("textarea")).toHaveLength(1);
    });

    it("typing in an array textarea calls handleChange", async () => {
      const user = userEvent.setup();
      mockState = { value: [""], meta: { isValid: true, errors: [] } };
      const { container } = renderField(
        primitive("textarea", { behaviours: [fieldArrayBehaviour] }),
      );
      const textarea = container.querySelector(
        "textarea",
      ) as HTMLTextAreaElement;
      await user.type(textarea, "hello");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // tel / email htmlType (same code path as text)
  // -------------------------------------------------------------------------
  describe("tel, email htmlType", () => {
    it.each(["tel", "email"] as ClientPrimitive["htmlType"][])(
      "%s → renders an input element",
      (htmlType) => {
        const { container } = renderField(primitive(htmlType));
        expect(container.querySelector("input")).toBeTruthy();
      },
    );
  });

  // -------------------------------------------------------------------------
  // number htmlType — design-system number input with custom steppers
  // -------------------------------------------------------------------------
  describe("number htmlType", () => {
    it("renders a design-system number input with two custom steppers", () => {
      const { container } = renderField(primitive("number"));
      const input = container.querySelector("input.govbb-number-input");
      expect(input).toBeTruthy();
      expect(input).toHaveAttribute("type", "number");
      expect(
        container.querySelectorAll(".govbb-number-input__step"),
      ).toHaveLength(2);
    });

    it("Increment steps the value up by 1", async () => {
      const user = userEvent.setup();
      mockState = { value: "5", meta: { isValid: true, errors: [] } };
      renderField(primitive("number"));
      await user.click(screen.getByRole("button", { name: "Increment" }));
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith("6");
    });

    it("Decrement steps the value down by 1", async () => {
      const user = userEvent.setup();
      mockState = { value: "5", meta: { isValid: true, errors: [] } };
      renderField(primitive("number"));
      await user.click(screen.getByRole("button", { name: "Decrement" }));
      expect(mockFieldApi.handleChange).toHaveBeenCalledWith("4");
    });

    // The mock handleChange never feeds the new value back into mockState, so
    // both clicks step from the same blank base (0) — this asserts blank → ±1
    // in each direction independently, NOT a sequential increment-then-decrement.
    it("steps from a blank value to 1 (up) and -1 (down)", async () => {
      const user = userEvent.setup();
      renderField(primitive("number")); // value is undefined
      await user.click(screen.getByRole("button", { name: "Increment" }));
      expect(mockFieldApi.handleChange).toHaveBeenLastCalledWith("1");
      await user.click(screen.getByRole("button", { name: "Decrement" }));
      expect(mockFieldApi.handleChange).toHaveBeenLastCalledWith("-1");
    });

    it("renders the number input and steppers in the Add-another array path", () => {
      const { container } = renderField(
        primitive("number", {
          behaviours: [{ type: "fieldArray", min: 1, max: 3 } as any],
        }),
      );
      expect(container.querySelector("input.govbb-number-input")).toBeTruthy();
      expect(
        container.querySelectorAll(".govbb-number-input__step").length,
      ).toBeGreaterThanOrEqual(2);
    });
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

    it("tags the checkbox item with the single-checkbox alignment class", () => {
      const { container } = renderField(
        primitive("checkbox", { options: singleOption }),
      );
      const item = container.querySelector(".govbb-checkbox-item");
      expect(item).toHaveClass("form-page__single-checkbox");
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

    it("does not tag multi-option items with the single-checkbox alignment class", () => {
      const { container } = renderField(
        primitive("checkbox", { options: multiOptions }),
      );
      const items = container.querySelectorAll(".govbb-checkbox-item");
      expect(items.length).toBeGreaterThan(1);
      items.forEach((item) =>
        expect(item).not.toHaveClass("form-page__single-checkbox"),
      );
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
        value: { day: "1", month: "6", year: "2024" },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      await user.clear(dayInput);
      await user.type(dayInput, "15");
      expect(mockFieldApi.handleChange).toHaveBeenCalled();
    });

    it("typing a non-numeric character never stores NaN", async () => {
      const user = userEvent.setup();
      mockState = {
        value: { day: "1", month: "6", year: "2024" },
        meta: { isValid: true, errors: [] },
      };
      const { container } = renderField(primitive("date"));
      const dateParts = container.querySelectorAll(".govbb-date-input__part");
      const dayInput = dateParts[0].querySelector("input") as HTMLInputElement;
      await user.clear(dayInput);
      await user.type(dayInput, "a");
      // Regression: non-numeric input must never be stored (#815 keeps parts as
      // digit-strings, so a stray "a" yields `undefined`, never "NaN").
      for (const [arg] of mockFieldApi.handleChange.mock.calls) {
        const day = (arg as { day?: string }).day;
        expect(day === undefined || /^\d+$/.test(day)).toBe(true);
      }
    });

    it("changing the month input calls handleChange with updated month", async () => {
      const user = userEvent.setup();
      mockState = {
        value: { day: "1", month: "6", year: "2024" },
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
        value: { day: "1", month: "6", year: "2024" },
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
  });

  // -------------------------------------------------------------------------
  // Date field error highlighting (GOV.UK guidance: highlight failing parts)
  // -------------------------------------------------------------------------
  describe("date field error highlighting", () => {
    const partInputs = (container: HTMLElement) =>
      Array.from(
        container.querySelectorAll(".govbb-date-input__field"),
      ) as HTMLInputElement[];

    it("renders the structured error's message and highlights only its parts", () => {
      mockState = {
        value: { day: "5", year: "1990" },
        meta: {
          isValid: false,
          errors: [
            { message: "Date of birth must include a month", parts: ["month"] },
          ],
        },
      };
      const { container } = renderField(primitive("date"));

      expect(
        screen.getByText("Date of birth must include a month"),
      ).toBeTruthy();
      const [day, month, year] = partInputs(container);
      expect(day.getAttribute("aria-invalid")).toBeNull();
      expect(month.getAttribute("aria-invalid")).toBe("true");
      expect(year.getAttribute("aria-invalid")).toBeNull();
    });

    it("highlights the whole input when all parts are listed", () => {
      mockState = {
        value: undefined,
        meta: {
          isValid: false,
          errors: [
            {
              message: "Enter date of birth",
              parts: ["day", "month", "year"],
            },
          ],
        },
      };
      const { container } = renderField(primitive("date"));
      partInputs(container).forEach((input) => {
        expect(input.getAttribute("aria-invalid")).toBe("true");
      });
    });

    it("falls back to highlighting every part for a plain string error", () => {
      mockState = {
        value: undefined,
        meta: { isValid: false, errors: ["Some error"] },
      };
      const { container } = renderField(primitive("date"));
      expect(screen.getByText("Some error")).toBeTruthy();
      partInputs(container).forEach((input) => {
        expect(input.getAttribute("aria-invalid")).toBe("true");
      });
    });

    it("anchors the fieldset with the field id and describes errors at group level", () => {
      mockState = {
        value: undefined,
        meta: {
          isValid: false,
          errors: [
            { message: "Enter date of birth", parts: ["day", "month", "year"] },
          ],
        },
      };
      const field = primitive("date");
      const { container } = renderField(field);

      // The ErrorSummary links to #field.id — the fieldset must carry it.
      const fieldset = container.querySelector(`[id="${field.id}"]`);
      expect(fieldset?.tagName).toBe("FIELDSET");
      expect(fieldset?.getAttribute("role")).toBe("group");
      expect(fieldset?.getAttribute("aria-describedby")).toBe(
        `${field.id}-error`,
      );
      // Inputs are described at the group level, not individually.
      partInputs(container as HTMLElement).forEach((input) => {
        expect(input.getAttribute("aria-describedby")).toBeNull();
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
  // Select with inset fields (#863) — same conditional-reveal pattern as
  // radio, but the inset renders below the whole control since a <select>
  // has no per-option DOM position.
  // -------------------------------------------------------------------------
  describe("select with insetFieldsByOption", () => {
    const selectOptions = [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ];

    function insetEntriesFor(value: string) {
      const insetField = primitive("text", {
        id: "step-1.inset-field",
        fieldId: "inset-field",
        name: "inset-field",
        label: "Inset field label",
        htmlType: "text",
      });
      return new Map([
        [value, [{ field: insetField, validationProperties: noValidation }]],
      ]);
    }

    it("shows inset fields when the selected value has inset entries", () => {
      mockState = { value: "yes", meta: { isValid: true, errors: [] } };

      const { container } = renderField(
        primitive("select", { options: selectOptions }),
        { insetFieldsByOption: insetEntriesFor("yes") },
      );

      const inset = container.querySelector(".govbb-select__conditional");
      expect(inset).toBeTruthy();
      // The inset field itself renders inside the conditional wrapper.
      expect(inset?.querySelector("input")).toBeTruthy();
    });

    it("does not show inset fields when a different value is selected", () => {
      mockState = { value: "no", meta: { isValid: true, errors: [] } };

      const { container } = renderField(
        primitive("select", { options: selectOptions }),
        { insetFieldsByOption: insetEntriesFor("yes") },
      );

      expect(container.querySelector(".govbb-select__conditional")).toBeNull();
    });

    it("does not show inset fields when nothing is selected", () => {
      mockState = { value: undefined, meta: { isValid: true, errors: [] } };

      const { container } = renderField(
        primitive("select", { options: selectOptions }),
        { insetFieldsByOption: insetEntriesFor("yes") },
      );

      expect(container.querySelector(".govbb-select__conditional")).toBeNull();
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
