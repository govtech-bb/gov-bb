import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import Review from "./review";
import type { ClientFormStep, FormMeta } from "@forms/types";

// Mock TanStack Router — Review calls useNavigate({ from: "/forms/$formId/" })
// which requires a router context unavailable in jsdom unit tests.
const mockNavigate = jest.fn();
jest.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeField(
  overrides: Partial<import("@forms/types").ClientPrimitive> = {},
): import("@forms/types").ClientPrimitive {
  return {
    id: `step-1.text-field`,
    fieldId: "text-field",
    stepId: "step-1",
    name: "text-field",
    label: "Full name",
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    behaviours: [],
    ...overrides,
  };
}

function makeStep(
  overrides: Partial<ClientFormStep> & { stepId: string; title: string },
): ClientFormStep {
  return {
    fields: [],
    ...overrides,
  };
}

const baseFormMeta: Pick<FormMeta, "formId"> = { formId: "test-form" };

function makeMockForm(values: Record<string, unknown> = {}) {
  return {
    getFieldValue: jest.fn((fieldId: string) => values[fieldId]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Review", () => {
  beforeEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it("renders one section per visible step", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [
          makeField({
            id: "step-personal.name",
            fieldId: "name",
            label: "Name",
          }),
        ],
      }),
      makeStep({
        stepId: "step-address",
        title: "Address",
        fields: [
          makeField({
            id: "step-address.street",
            fieldId: "street",
            label: "Street",
          }),
        ],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Personal Details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Address" }),
    ).toBeInTheDocument();
  });

  it("renders a label and value row per visible field", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [
          makeField({
            id: "step-1.first-name",
            fieldId: "first-name",
            label: "First name",
          }),
          makeField({
            id: "step-1.last-name",
            fieldId: "last-name",
            label: "Last name",
          }),
        ],
      }),
    ];
    const form = makeMockForm({
      "step-1.first-name": "Alice",
      "step-1.last-name": "Smith",
    });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("First name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Last name")).toBeInTheDocument();
    expect(screen.getByText("Smith")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Hidden fields
  // -------------------------------------------------------------------------

  it("does not render fields where hidden=true", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [
          makeField({
            id: "step-1.visible",
            fieldId: "visible",
            label: "Visible field",
          }),
          makeField({
            id: "step-1.hidden",
            fieldId: "hidden",
            label: "Hidden field",
            hidden: true,
          }),
        ],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm({ "step-1.visible": "Answered" }) as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Visible field")).toBeInTheDocument();
    expect(screen.queryByText("Hidden field")).not.toBeInTheDocument();
  });

  it("does not render fields where conditionallyHidden=true", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [
          makeField({
            id: "step-1.shown",
            fieldId: "shown",
            label: "Shown field",
          }),
          makeField({
            id: "step-1.cond-hidden",
            fieldId: "cond-hidden",
            label: "Conditional field",
            conditionallyHidden: true,
          }),
        ],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm({ "step-1.shown": "Answered" }) as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Shown field")).toBeInTheDocument();
    expect(screen.queryByText("Conditional field")).not.toBeInTheDocument();
  });

  it("renders an empty section with title and Change link when all fields in a step are hidden", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Hidden Fields Step",
        fields: [
          makeField({
            id: "step-1.field-1",
            fieldId: "field-1",
            label: "Hidden field 1",
            hidden: true,
          }),
          makeField({
            id: "step-1.field-2",
            fieldId: "field-2",
            label: "Hidden field 2",
            hidden: true,
          }),
        ],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    // Section title and Change link should still render
    expect(
      screen.getByRole("heading", { name: "Hidden Fields Step" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Change/ })).toBeInTheDocument();

    // But the hidden fields should not render
    expect(screen.queryByText("Hidden field 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden field 2")).not.toBeInTheDocument();

    // A section with no visible rows shows a "No values provided" message
    expect(screen.getByText("No values provided")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Empty values — omit the row entirely (issue #629)
  // -------------------------------------------------------------------------

  it("text/default field with no value renders no row", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [
          makeField({
            id: "step-1.name",
            fieldId: "name",
            label: "Full name",
            htmlType: "text",
          }),
        ],
      }),
    ];
    // no value supplied for the field
    const form = makeMockForm({});

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.queryByText("Full name")).not.toBeInTheDocument();
    expect(screen.getByText("No values provided")).toBeInTheDocument();
  });

  it("select field with no matching option renders no row", () => {
    const selectField = makeField({
      id: "step-1.country",
      fieldId: "country",
      label: "Country",
      htmlType: "select",
      options: [
        { value: "bb", label: "Barbados" },
        { value: "tt", label: "Trinidad and Tobago" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [selectField] }),
    ];
    // no value selected — nothing matches
    const form = makeMockForm({});

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.queryByText("Country")).not.toBeInTheDocument();
  });

  it("radio field with no selection renders no row", () => {
    const radioField = makeField({
      id: "step-1.gender",
      fieldId: "gender",
      label: "Gender",
      htmlType: "radio",
      options: [
        { value: "m", label: "Male" },
        { value: "f", label: "Female" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [radioField] }),
    ];
    const form = makeMockForm({});

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.queryByText("Gender")).not.toBeInTheDocument();
  });

  it("checkbox field with empty selection renders no row", () => {
    const checkboxField = makeField({
      id: "step-1.interests",
      fieldId: "interests",
      label: "Interests",
      htmlType: "checkbox",
      options: [
        { value: "sport", label: "Sport" },
        { value: "music", label: "Music" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [checkboxField],
      }),
    ];
    const form = makeMockForm({ "step-1.interests": [] });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.queryByText("Interests")).not.toBeInTheDocument();
  });

  it("date field with no value renders no row", () => {
    const dateField = makeField({
      id: "step-1.dob",
      fieldId: "dob",
      label: "Date of birth",
      htmlType: "date",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [dateField] }),
    ];
    const form = makeMockForm({});

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.queryByText("Date of birth")).not.toBeInTheDocument();
  });

  it("omits only the empty fields, keeping populated ones in the same step", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [
          makeField({
            id: "step-1.first-name",
            fieldId: "first-name",
            label: "First name",
          }),
          makeField({
            id: "step-1.last-name",
            fieldId: "last-name",
            label: "Last name",
          }),
        ],
      }),
    ];
    // only first-name is filled in
    const form = makeMockForm({ "step-1.first-name": "Alice" });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("First name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Last name")).not.toBeInTheDocument();
    // at least one row present, so no "No values provided" message
    expect(screen.queryByText("No values provided")).not.toBeInTheDocument();
  });

  it("file field with no upload still renders its row (No file selected)", () => {
    const fileField = makeField({
      id: "step-1.attachment",
      fieldId: "attachment",
      label: "Attachment",
      htmlType: "file",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [fileField] }),
    ];
    const form = makeMockForm({ "step-1.attachment": [] });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    // file rows always survive the empty-value filter
    expect(screen.getByText("Attachment")).toBeInTheDocument();
    expect(screen.getByText("No file selected")).toBeInTheDocument();
    expect(screen.queryByText("No values provided")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Excluded system steps
  // -------------------------------------------------------------------------

  it("does not render check-your-answers step", () => {
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [] }),
      makeStep({
        stepId: "check-your-answers",
        title: "Check your answers",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Step One" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Check your answers" }),
    ).not.toBeInTheDocument();
  });

  it("does not render declaration step", () => {
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [] }),
      makeStep({ stepId: "declaration", title: "Declaration", fields: [] }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Step One" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Declaration" }),
    ).not.toBeInTheDocument();
  });

  it("does not render submission-confirmation step", () => {
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [] }),
      makeStep({
        stepId: "submission-confirmation",
        title: "Submission Confirmation",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Step One" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Submission Confirmation" }),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Field display value formatting
  // -------------------------------------------------------------------------

  it("select field displays option label, not raw value", () => {
    const selectField = makeField({
      id: "step-1.country",
      fieldId: "country",
      label: "Country",
      htmlType: "select",
      options: [
        { value: "bb", label: "Barbados" },
        { value: "tt", label: "Trinidad and Tobago" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [selectField] }),
    ];
    const form = makeMockForm({ "step-1.country": "bb" });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Barbados")).toBeInTheDocument();
    expect(screen.queryByText("bb")).not.toBeInTheDocument();
  });

  it("radio field displays option label, not raw value", () => {
    const radioField = makeField({
      id: "step-1.gender",
      fieldId: "gender",
      label: "Gender",
      htmlType: "radio",
      options: [
        { value: "m", label: "Male" },
        { value: "f", label: "Female" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [radioField] }),
    ];
    const form = makeMockForm({ "step-1.gender": "f" });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Female")).toBeInTheDocument();
    expect(screen.queryByText("f")).not.toBeInTheDocument();
  });

  it("checkbox field displays option labels joined by comma, not raw values", () => {
    const checkboxField = makeField({
      id: "step-1.interests",
      fieldId: "interests",
      label: "Interests",
      htmlType: "checkbox",
      options: [
        { value: "sport", label: "Sport" },
        { value: "music", label: "Music" },
        { value: "art", label: "Art" },
      ],
    });
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Step One",
        fields: [checkboxField],
      }),
    ];
    const form = makeMockForm({ "step-1.interests": ["sport", "art"] });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Sport, Art")).toBeInTheDocument();
    expect(screen.queryByText("sport")).not.toBeInTheDocument();
  });

  it("date field displays a formatted date string", () => {
    const dateField = makeField({
      id: "step-1.dob",
      fieldId: "dob",
      label: "Date of birth",
      htmlType: "date",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [dateField] }),
    ];
    const form = makeMockForm({
      "step-1.dob": { day: 1, month: 1, year: 2026 },
    });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    const expectedDate = new Date(2026, 0, 1)
      .toDateString()
      .trim()
      .replace(/^\w+\s/, "");
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it("file field with no uploaded files displays 'No file selected'", () => {
    const fileField = makeField({
      id: "step-1.attachment",
      fieldId: "attachment",
      label: "Attachment",
      htmlType: "file",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [fileField] }),
    ];
    // value is an empty array — no files selected
    const form = makeMockForm({ "step-1.attachment": [] });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("No file selected")).toBeInTheDocument();
  });

  it("file field with uploaded files — displays comma-joined file names", () => {
    const fileField = makeField({
      id: "step-1.attachment",
      fieldId: "attachment",
      label: "Attachment",
      htmlType: "file",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [fileField] }),
    ];
    const mockFiles = [{ name: "passport.pdf" }, { name: "id-card.jpg" }];
    const form = makeMockForm({ "step-1.attachment": mockFiles });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("passport.pdf, id-card.jpg")).toBeInTheDocument();
  });

  it("default (text) field displays the raw string value", () => {
    const textField = makeField({
      id: "step-1.name",
      fieldId: "name",
      label: "Full name",
      htmlType: "text",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [textField] }),
    ];
    const form = makeMockForm({ "step-1.name": "Jane Doe" });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Change links
  // -------------------------------------------------------------------------

  it("renders a Change link for each visible step", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [],
      }),
      makeStep({ stepId: "step-address", title: "Address", fields: [] }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    const changeLinks = screen.getAllByRole("link", { name: /Change/ });
    expect(changeLinks).toHaveLength(2);
  });

  it("Change link has the correct href for each step", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={{ ...baseFormMeta, formId: "my-form" } as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    const changeLink = screen.getByRole("link", { name: /Change/ });
    expect(changeLink).toHaveAttribute(
      "href",
      "/forms/my-form?step=step-personal",
    );
  });

  it("Change link exposes the step name to assistive tech via visually-hidden text", () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    // The visible label is "Change"; the accessible name also carries the step
    // title so screen-reader users know what the link changes.
    expect(
      screen.getByRole("link", { name: "Change Personal Details" }),
    ).toBeInTheDocument();
  });

  it("clicking a Change link triggers navigate", async () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    const user = userEvent.setup();
    const changeLink = screen.getByRole("link", { name: /Change/ });
    await user.click(changeLink);

    expect(mockNavigate).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // handleChangeClick — navigate call with search param (line 41)
  // -------------------------------------------------------------------------

  it("clicking a Change link calls navigate with a search callback that sets the step param", async () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-personal",
        title: "Personal Details",
        fields: [],
      }),
    ];

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={makeMockForm() as never}
        visibleSteps={steps}
      />,
    );

    const user = userEvent.setup();
    const changeLink = screen.getByRole("link", { name: /Change/ });
    await user.click(changeLink);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.any(Function),
      }),
    );

    // Invoke the search callback and verify it sets the correct step
    const callArgs = mockNavigate.mock.calls[0][0] as {
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    const result = callArgs.search({ existing: "value" });
    expect(result).toEqual({ existing: "value", step: "step-personal" });
  });

  // -------------------------------------------------------------------------
  // getUploadedFileName — File instance branch (line 52)
  // -------------------------------------------------------------------------

  it("file field with real File instances — displays comma-joined file names", () => {
    const fileField = makeField({
      id: "step-1.attachment",
      fieldId: "attachment",
      label: "Attachment",
      htmlType: "file",
    });
    const steps: ClientFormStep[] = [
      makeStep({ stepId: "step-1", title: "Step One", fields: [fileField] }),
    ];
    const realFiles = [
      new File(["content"], "document.pdf", { type: "application/pdf" }),
      new File(["content"], "photo.jpg", { type: "image/jpeg" }),
    ];
    const form = makeMockForm({ "step-1.attachment": realFiles });

    render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    expect(screen.getByText("document.pdf, photo.jpg")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it("passes jest-axe accessibility audit", async () => {
    const steps: ClientFormStep[] = [
      makeStep({
        stepId: "step-1",
        title: "Personal Details",
        fields: [
          makeField({ id: "step-1.name", fieldId: "name", label: "Full name" }),
        ],
      }),
    ];
    const form = makeMockForm({ "step-1.name": "Alice" });

    const { container } = render(
      <Review
        formMeta={baseFormMeta as FormMeta}
        form={form as never}
        visibleSteps={steps}
      />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
