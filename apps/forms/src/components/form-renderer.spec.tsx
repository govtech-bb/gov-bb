/**
 * form-renderer.spec.tsx
 *
 * Covers:
 * - Returns null when visibleSteps is empty
 * - Renders the form title on a normal step
 * - Renders the step title
 * - Hides the Previous button on the first step (currentIndex = 0)
 * - Shows the Previous button when not on the first step (currentIndex = 1)
 * - Shows "Continue" button on regular steps
 * - Shows "Submit" button on the declaration step
 * - Does NOT show navigation buttons on the submission-confirmation step
 * - Renders Review component on check-your-answers step
 * - Renders ApplicantNameDisplay on the declaration step
 * - Renders SubmissionConfirmation on the submission-confirmation step
 * - Renders a FieldRenderer for each plain field in the step
 * - show-hide group: renders controlled fields when toggle value is true
 * - show-hide group: does not render controlled fields when toggle value is false
 * - radio-conditional: radio field with conditional child is grouped correctly
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useStore } from "@tanstack/react-form";
import { useStepGuard } from "../hooks/use-step-guard";

jest.mock("@tanstack/react-form", () => ({
  useStore: jest.fn(),
}));

jest.mock("../hooks/use-step-guard", () => ({
  useStepGuard: jest.fn(),
}));

// The mock surfaces enough of the props passed to FieldRenderer that wiring
// tests can verify the toggle/insetFieldsByOption arguments — without this
// extra metadata the spec could only assert which field IDs were rendered,
// not whether the right props were threaded through.
jest.mock("./field-renderer", () => ({
  __esModule: true,
  default: (props: {
    field: { id: string };
    formVersion?: string;
    insetFieldsByOption?: Map<string, Array<{ field: { id: string } }>>;
  }) => (
    <div
      data-testid="field-renderer"
      data-field-id={props.field.id}
      data-form-version={props.formVersion}
      data-inset-options={
        props.insetFieldsByOption
          ? JSON.stringify(
              Array.from(props.insetFieldsByOption.entries()).map(
                ([value, entries]) => [value, entries.map((e) => e.field.id)],
              ),
            )
          : ""
      }
    />
  ),
}));

jest.mock("./error-summary", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./review", () => ({
  __esModule: true,
  default: () => <div data-testid="review" />,
}));

jest.mock("./submission-confirmation", () => ({
  __esModule: true,
  default: () => <div data-testid="submission-confirmation" />,
}));

jest.mock("./applicant-name-display", () => ({
  __esModule: true,
  default: () => <div data-testid="applicant-name-display" />,
}));

jest.mock("@forms/lib", () => ({
  getFullFieldId: (step: string, field: string) => `${step}_${field}`,
  addRepeatableStep: jest.fn(() => []),
  removeRepeatableStep: jest.fn(() => []),
  stepFieldIdConcactenator: "_",
  repeatStepConcactenator: "~",
  getRepeatStepCount: jest.fn(() => undefined),
  getInstanceMarker: jest.fn(() => undefined),
  buildFieldValidationProperties: jest.fn(() => ({
    onDynamic: jest.fn(),
    onBlur: jest.fn(),
  })),
}));

import FormRenderer from "./form-renderer";

const mockUseStore = useStore as jest.Mock;
const mockUseStepGuard = useStepGuard as jest.Mock;

const mockNavigateToStep = jest.fn();
const mockCompleteAndContinue = jest.fn();

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    formId: "test-form",
    formTitle: "Test Form",
    steps: [],
    validationProperties: {},
    contactDetails: undefined,
    defaultValues: {},
    repeatSettings: {},
    stepConditionalTargets: {},
    ...overrides,
  };
}

function makeStep(stepId: string, fields: any[] = [], behaviours: any[] = []) {
  return { stepId, title: `Step ${stepId}`, fields, behaviours };
}

function makePlainField(id: string, fieldId: string, stepId: string) {
  return {
    id,
    fieldId,
    stepId,
    name: fieldId,
    label: fieldId,
    htmlType: "text" as const,
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
    behaviours: [],
  };
}

const mockForm = {
  store: {},
  state: { isValid: true, isSubmitting: false, values: {} },
  getFieldValue: jest.fn(),
  validateField: jest.fn().mockResolvedValue([]),
  handleSubmit: jest.fn(),
  deleteField: jest.fn(),
};

const mockRepeatableStepSettingsRef = { current: {} };

const mockSubmissionState = {
  hasPayment: false,
  serviceName: "Test Service",
  submissionSuccess: true,
  referenceNumber: "REF-001",
  date: "2026-05-22",
};

beforeEach(() => {
  // resetAllMocks clears both call history AND mock implementations / return
  // values set via mockReturnValue/mockResolvedValue. Without this, e.g.
  // `mockForm.getFieldValue.mockReturnValue("yes")` set in one test would
  // silently leak into subsequent tests under `clearAllMocks`.
  jest.resetAllMocks();
  // resetAllMocks doesn't touch plain object fields, so reset form.state too.
  mockForm.state = { isValid: true, isSubmitting: false, values: {} };
  mockForm.validateField.mockResolvedValue([]);
  mockUseStepGuard.mockReturnValue({
    navigateToStep: mockNavigateToStep,
    completeAndContinue: mockCompleteAndContinue,
    currentIndex: 0,
  });
  mockUseStore.mockImplementation(
    (_store: unknown, selector: (state: any) => any) => {
      if (!selector) return {};
      try {
        return selector({ values: {}, fieldMeta: {} });
      } catch {
        return {};
      }
    },
  );
});

describe("FormRenderer", () => {
  it("returns null when visibleSteps is empty", () => {
    const { container } = render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the form title on a normal step", () => {
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta({ formTitle: "My Form" }) as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByText(/My Form/)).toBeInTheDocument();
  });

  it("renders the step title", () => {
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Step step-1/ }),
    ).toBeInTheDocument();
  });

  it("hides Previous button on first step (currentIndex = 0)", () => {
    mockUseStepGuard.mockReturnValue({
      navigateToStep: mockNavigateToStep,
      completeAndContinue: mockCompleteAndContinue,
      currentIndex: 0,
    });
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Previous button when not on first step (currentIndex = 1)", () => {
    mockUseStepGuard.mockReturnValue({
      navigateToStep: mockNavigateToStep,
      completeAndContinue: mockCompleteAndContinue,
      currentIndex: 1,
    });
    const step1 = makeStep("step-1");
    const step2 = makeStep("step-2");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-2"
        visibleSteps={[step1, step2]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Continue' button on regular steps", () => {
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Submit' button on the declaration step", () => {
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continue/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Submit' on the step before submission-confirmation even without a declaration step", () => {
    // Surveys like the exit survey carry no `declaration` step; build-form
    // injects check-your-answers immediately before submission-confirmation, so
    // that becomes the submit step. Without this the survey could never be
    // submitted (its Continue button would skip the submission entirely).
    const cya = makeStep("check-your-answers");
    const confirmation = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="check-your-answers"
        visibleSteps={[cya, confirmation]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continue/i }),
    ).not.toBeInTheDocument();
  });

  it("does not show navigation buttons on submission-confirmation step", () => {
    const step = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="submission-confirmation"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /continue/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /submit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Review component on check-your-answers step", () => {
    const step = makeStep("check-your-answers");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="check-your-answers"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByTestId("review")).toBeInTheDocument();
  });

  it("renders ApplicantNameDisplay on declaration step", () => {
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByTestId("applicant-name-display")).toBeInTheDocument();
  });

  it("renders SubmissionConfirmation on submission-confirmation step", () => {
    const step = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="submission-confirmation"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByTestId("submission-confirmation")).toBeInTheDocument();
  });

  it("redirects to check-your-answers when on submission-confirmation with no submissionState", () => {
    const step = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="submission-confirmation"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={undefined}
      />,
    );
    // Refreshing on the confirmation step loses the in-memory submissionState.
    // Rather than render an empty (or previously fake) confirmation, bounce the
    // user back to where they can re-submit.
    expect(mockNavigateToStep).toHaveBeenCalledWith("check-your-answers");
  });

  it("does NOT redirect away from submission-confirmation when submissionState exists", () => {
    const step = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="submission-confirmation"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(mockNavigateToStep).not.toHaveBeenCalledWith("check-your-answers");
  });

  it("renders a FieldRenderer for each plain field in the step", () => {
    const fields = [
      makePlainField("step-1_field-a", "field-a", "step-1"),
      makePlainField("step-1_field-b", "field-b", "step-1"),
    ];
    const step = makeStep("step-1", fields);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    const renderers = screen.getAllByTestId("field-renderer");
    expect(renderers).toHaveLength(2);
  });

  it("threads formVersion to plain field renderers (needed for file presign, #438)", () => {
    const fields = [makePlainField("step-1_doc", "doc", "step-1")];
    const step = makeStep("step-1", fields);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta({ steps: [step], version: "1.1.0" }) as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByTestId("field-renderer")).toHaveAttribute(
      "data-form-version",
      "1.1.0",
    );
  });

  it("builds validators from the field when it is missing from validationProperties (repeat instances, #432)", () => {
    const { buildFieldValidationProperties } = jest.requireMock("@forms/lib");
    // A repeat-instance field (step~N_*) that buildValidation never saw, so it
    // has no entry in formMeta.validationProperties. Before the fix it would be
    // rendered with no validators and silently bypass validation.
    const repeatField = makePlainField("step-1~1_name", "name", "step-1~1");
    const presentField = makePlainField("step-1~1_age", "age", "step-1~1");
    const step = makeStep("step-1~1", [repeatField, presentField]);

    render(
      <FormRenderer
        form={mockForm}
        formMeta={
          makeMeta({
            steps: [step],
            // Only `age` has a pre-built validator entry; `name` does not.
            validationProperties: {
              "step-1~1_age": { onDynamic: jest.fn(), onBlur: jest.fn() },
            },
          }) as any
        }
        stepId="step-1~1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    // The missing field falls back to building validators from the field; the
    // present field uses its pre-built entry and is not rebuilt.
    expect(buildFieldValidationProperties).toHaveBeenCalledWith(repeatField);
    expect(buildFieldValidationProperties).not.toHaveBeenCalledWith(
      presentField,
    );
  });

  it("show-hide group: renders controlled fields when toggle value is true", () => {
    const toggleField = {
      id: "step1_toggle",
      fieldId: "toggle",
      stepId: "step1",
      name: "toggle",
      label: "Toggle",
      htmlType: "show-hide" as any,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [],
    };
    const controlledField = {
      id: "step1_detail",
      fieldId: "detail",
      stepId: "step1",
      name: "detail",
      label: "Detail",
      htmlType: "text" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [{ type: "fieldConditionalOn", targetFieldId: "toggle" }],
    };
    const step = makeStep("step1", [toggleField, controlledField]);

    mockUseStore.mockImplementation((_store: any, selector: any) => {
      try {
        return selector({ values: { step1_toggle: true }, fieldMeta: {} });
      } catch {
        return {};
      }
    });

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    const renderers = screen.getAllByTestId("field-renderer");
    const fieldIds = renderers.map((el) => el.getAttribute("data-field-id"));
    expect(fieldIds).toContain("step1_toggle");
    expect(fieldIds).toContain("step1_detail");
  });

  it("show-hide group: does not render controlled fields when toggle value is false", () => {
    const toggleField = {
      id: "step1_toggle",
      fieldId: "toggle",
      stepId: "step1",
      name: "toggle",
      label: "Toggle",
      htmlType: "show-hide" as any,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [],
    };
    const controlledField = {
      id: "step1_detail",
      fieldId: "detail",
      stepId: "step1",
      name: "detail",
      label: "Detail",
      htmlType: "text" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [{ type: "fieldConditionalOn", targetFieldId: "toggle" }],
    };
    const step = makeStep("step1", [toggleField, controlledField]);

    mockUseStore.mockImplementation((_store: any, selector: any) => {
      try {
        return selector({ values: { step1_toggle: false }, fieldMeta: {} });
      } catch {
        return {};
      }
    });

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    const renderers = screen.getAllByTestId("field-renderer");
    const fieldIds = renderers.map((el) => el.getAttribute("data-field-id"));
    expect(fieldIds).toContain("step1_toggle");
    expect(fieldIds).not.toContain("step1_detail");
  });

  it("radio-conditional: radio field with conditional child is rendered as a FieldRenderer group", () => {
    const radioField = {
      id: "step1_choice",
      fieldId: "choice",
      stepId: "step1",
      name: "choice",
      label: "Choice",
      htmlType: "radio" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      behaviours: [],
    };
    const conditionalChild = {
      id: "step1_extra",
      fieldId: "extra",
      stepId: "step1",
      name: "extra",
      label: "Extra",
      htmlType: "text" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [
        {
          type: "fieldConditionalOn",
          targetFieldId: "choice",
          operator: "equal",
          value: "yes",
        },
      ],
    };
    const step = makeStep("step1", [radioField, conditionalChild]);

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    const renderers = screen.getAllByTestId("field-renderer");
    const fieldIds = renderers.map((el) => el.getAttribute("data-field-id"));
    expect(fieldIds).toContain("step1_choice");
    expect(fieldIds).not.toContain("step1_extra");

    // Verify the radio's `insetFieldsByOption` actually carries the
    // conditional child keyed by the option value the source wired it to.
    // Without this assertion the test only proves which field IDs render
    // outermost — it would not catch a regression that drops the
    // insetFieldsByOption prop or keys the entry under the wrong option.
    const radioEl = renderers.find(
      (el) => el.getAttribute("data-field-id") === "step1_choice",
    )!;
    const insetOptions = JSON.parse(
      radioEl.getAttribute("data-inset-options") || "[]",
    ) as Array<[string, string[]]>;
    expect(insetOptions).toEqual([["yes", ["step1_extra"]]]);
  });

  it("select-conditional: select field with conditional child is grouped with insetFieldsByOption (#863)", () => {
    const selectField = {
      id: "step1_choice",
      fieldId: "choice",
      stepId: "step1",
      name: "choice",
      label: "Choice",
      htmlType: "select" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      behaviours: [],
    };
    const conditionalChild = {
      id: "step1_extra",
      fieldId: "extra",
      stepId: "step1",
      name: "extra",
      label: "Extra",
      htmlType: "text" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [
        {
          type: "fieldConditionalOn",
          targetFieldId: "choice",
          operator: "equal",
          value: "yes",
        },
      ],
    };
    const step = makeStep("step1", [selectField, conditionalChild]);

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    const renderers = screen.getAllByTestId("field-renderer");
    const fieldIds = renderers.map((el) => el.getAttribute("data-field-id"));
    expect(fieldIds).toContain("step1_choice");
    // The child is rendered inside the select's inset map, not page-level.
    expect(fieldIds).not.toContain("step1_extra");

    const selectEl = renderers.find(
      (el) => el.getAttribute("data-field-id") === "step1_choice",
    )!;
    const insetOptions = JSON.parse(
      selectEl.getAttribute("data-inset-options") || "[]",
    ) as Array<[string, string[]]>;
    expect(insetOptions).toEqual([["yes", ["step1_extra"]]]);
  });

  it("select-conditional: a multiple select keeps the page-level fallback (#863)", () => {
    const multiSelectField = {
      id: "step1_choice",
      fieldId: "choice",
      stepId: "step1",
      name: "choice",
      label: "Choice",
      htmlType: "select" as const,
      multiple: true,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
      behaviours: [],
    };
    const conditionalChild = {
      id: "step1_extra",
      fieldId: "extra",
      stepId: "step1",
      name: "extra",
      label: "Extra",
      htmlType: "text" as const,
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [
        {
          type: "fieldConditionalOn",
          targetFieldId: "choice",
          operator: "equal",
          value: "yes",
        },
      ],
    };
    const step = makeStep("step1", [multiSelectField, conditionalChild]);

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    // Both fields render as plain page-level renderers — no inset grouping.
    const renderers = screen.getAllByTestId("field-renderer");
    const fieldIds = renderers.map((el) => el.getAttribute("data-field-id"));
    expect(fieldIds).toContain("step1_choice");
    expect(fieldIds).toContain("step1_extra");

    const selectEl = renderers.find(
      (el) => el.getAttribute("data-field-id") === "step1_choice",
    )!;
    expect(selectEl.getAttribute("data-inset-options")).toBe("");
  });

  it("clicking Previous calls navigateToStep with the previous step's id", async () => {
    const user = userEvent.setup();
    mockUseStepGuard.mockReturnValue({
      navigateToStep: mockNavigateToStep,
      completeAndContinue: mockCompleteAndContinue,
      currentIndex: 1,
    });
    const step1 = makeStep("step-1");
    const step2 = makeStep("step-2");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-2"
        visibleSteps={[step1, step2]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(mockNavigateToStep).toHaveBeenCalledWith("step-1");
  });

  it("clicking Continue calls form.validateField for each field and then completeAndContinue", async () => {
    const user = userEvent.setup();
    const field = makePlainField("step-1_name", "name", "step-1");
    const step = makeStep("step-1", [field]);
    mockForm.validateField.mockResolvedValue([]);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(mockForm.validateField).toHaveBeenCalledWith(
      "step-1_name",
      "submit",
    );
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("step-1");
  });

  it("clicking Submit calls form.handleSubmit and completeAndContinue when valid", async () => {
    const user = userEvent.setup();
    mockForm.state = { isValid: true, isSubmitting: false, values: {} };
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(mockForm.handleSubmit).toHaveBeenCalled();
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("declaration");
  });

  // #317: form.handleSubmit() resolves even when validation fails (it just
  // skips onSubmit). Before the fix, completeAndContinue ran unconditionally
  // after the await, advancing the user past their own errors. Now it's gated
  // on form.state.isValid. Run this against the pre-fix handleSubmit and it
  // fails — completeAndContinue is called despite isValid being false.
  it("clicking Submit does NOT call completeAndContinue when the form is invalid", async () => {
    const user = userEvent.setup();
    mockForm.state = { isValid: false, isSubmitting: false, values: {} };
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    // handleSubmit still ran (and resolved) — proving the premise — but the
    // invalid form must keep the user on the step.
    expect(mockForm.handleSubmit).toHaveBeenCalledTimes(1);
    expect(mockCompleteAndContinue).not.toHaveBeenCalled();
  });

  it("clicking Submit on the pre-confirmation step (no declaration) submits and advances", async () => {
    // The exit-survey path: the submit handler must fire from whichever step
    // precedes submission-confirmation, not only from a `declaration` step.
    const user = userEvent.setup();
    mockForm.state = { isValid: true, isSubmitting: false, values: {} };
    const cya = makeStep("check-your-answers");
    const confirmation = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="check-your-answers"
        visibleSteps={[cya, confirmation]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(mockForm.handleSubmit).toHaveBeenCalled();
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("check-your-answers");
  });

  it("clicking Continue with validation errors does NOT call completeAndContinue", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "scrollTo", {
      value: jest.fn(),
      writable: true,
    });
    const field = makePlainField("step-1_name", "name", "step-1");
    const step = makeStep("step-1", [field]);
    mockForm.validateField.mockResolvedValue(["This field is required"]);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(mockCompleteAndContinue).not.toHaveBeenCalled();
  });

  it("clicking Continue on a repeatable step with addAnother=yes calls addRepeatableStep", async () => {
    const user = userEvent.setup();
    const { addRepeatableStep } = jest.requireMock("@forms/lib");
    (addRepeatableStep as jest.Mock).mockReturnValue([]);
    const repeatableBehaviour = { type: "repeatable", min: 1, max: 3 };
    const step = makeStep("step-1", [], [repeatableBehaviour]);
    mockForm.validateField.mockResolvedValue([]);
    mockForm.getFieldValue.mockReturnValue("yes");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(addRepeatableStep).toHaveBeenCalled();
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("step-1", []);
  });

  it("clicking Continue on a repeatable step with addAnother=no calls removeRepeatableStep", async () => {
    const user = userEvent.setup();
    const { removeRepeatableStep } = jest.requireMock("@forms/lib");
    (removeRepeatableStep as jest.Mock).mockReturnValue([]);
    const repeatableBehaviour = { type: "repeatable", min: 1, max: 3 };
    const step = makeStep("step-1", [], [repeatableBehaviour]);
    mockForm.validateField.mockResolvedValue([]);
    mockForm.getFieldValue.mockReturnValue("no");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(removeRepeatableStep).toHaveBeenCalled();
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("step-1", []);
  });

  it("purges removed instances' field values from the form store on 'No' (#432)", async () => {
    const user = userEvent.setup();
    const { removeRepeatableStep } = jest.requireMock("@forms/lib");
    const repeatableBehaviour = { type: "repeatable", min: 1, max: 3 };
    const baseStep = makeStep("step-1", [], [repeatableBehaviour]);
    const removedField = makePlainField("step-1~1_name", "name", "step-1~1");
    const removedStep = makeStep(
      "step-1~1",
      [removedField],
      [repeatableBehaviour],
    );
    // removeRepeatableStep prunes ~1, returning only the surviving base step.
    (removeRepeatableStep as jest.Mock).mockReturnValue([baseStep]);
    mockForm.validateField.mockResolvedValue([]);
    mockForm.getFieldValue.mockReturnValue("no");

    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[baseStep, removedStep]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    // The declined instance's field is deleted so it is not re-persisted and
    // resurrected on refresh.
    expect(mockForm.deleteField).toHaveBeenCalledWith("step-1~1_name");
  });

  it("renders step description when present", () => {
    const step = { ...makeStep("step-1"), description: "Fill in your details" };
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.getByText("Fill in your details")).toBeInTheDocument();
  });

  it("useEffect: assigns repeatableStepValues to stepData when settings are present", async () => {
    const { getRepeatStepCount } = jest.requireMock("@forms/lib");
    (getRepeatStepCount as jest.Mock).mockReturnValue(0);

    // Start stepData EMPTY so the assertion can only pass if the useEffect
    // actually populates it. A pre-populated `{ "step-1": {} }` would make
    // the toBeDefined assertion tautologically true regardless of whether
    // the effect ran.
    const stepData: Record<string, Record<string, string>> = {};
    const repeatableSettings = {
      "step-1": {
        minRepeats: 1,
        maxRepeats: 3,
        orderedStepIds: ["step-1"],
        stepData,
        sharedData: { field: undefined },
      },
    };

    mockUseStore.mockImplementation(
      (_store: unknown, selector: (state: any) => any) => {
        if (!selector) return {};
        try {
          return selector({
            values: { "step-1_field": "hello" },
            fieldMeta: {},
          });
        } catch {
          return {};
        }
      },
    );

    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={{ current: repeatableSettings } as any}
        submissionState={mockSubmissionState as any}
      />,
    );

    expect(stepData["step-1"]).toEqual({ "step-1_field": "hello" });
  });

  // #801: distinguish repeatable-step instances beyond the first.
  it("repeat instance marker: a non-repeat step renders the plain title with no caption", () => {
    const { getInstanceMarker } = jest.requireMock("@forms/lib");
    (getInstanceMarker as jest.Mock).mockReturnValue(undefined);
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    const heading = screen.getByRole("heading", { name: /Step step-1/ });
    expect(heading).toHaveTextContent("Step step-1");
    expect(heading.textContent).not.toContain("—");
    expect(
      screen.queryByTestId("repeat-instance-marker"),
    ).not.toBeInTheDocument();
  });

  it("repeat instance marker: an auto-numbered instance suffixes the title with ' — N' and renders no caption", () => {
    const { getInstanceMarker } = jest.requireMock("@forms/lib");
    (getInstanceMarker as jest.Mock).mockReturnValue({
      text: "2",
      hasLabel: false,
    });
    const repeatableBehaviour = { type: "repeatable", min: 1 };
    const step = makeStep("step-1~1", [], [repeatableBehaviour]);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1~1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    const heading = screen.getByRole("heading", { name: /Step step-1~1/ });
    expect(heading).toHaveTextContent("Step step-1~1 — 2");
    expect(
      screen.queryByTestId("repeat-instance-marker"),
    ).not.toBeInTheDocument();
  });

  it("shows the preview banner on a normal step when isPreview is true", () => {
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
        isPreview
      />,
    );
    const banner = screen.getByTestId("preview-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(
      /unpublished draft and cannot be submitted/i,
    );
  });

  it("does NOT show the preview banner when isPreview is omitted", () => {
    const step = makeStep("step-1");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    expect(screen.queryByTestId("preview-banner")).not.toBeInTheDocument();
  });

  it("disables and relabels the submit button on the declaration step in preview, and shows the hint", () => {
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
        isPreview
      />,
    );
    const submit = screen.getByRole("button", { name: /submit \(preview\)/i });
    expect(submit).toBeDisabled();
    expect(screen.getByTestId("preview-submit-hint")).toBeInTheDocument();
  });

  it("keeps the submit button enabled and labelled 'Submit' on the declaration step without preview", () => {
    const step = makeStep("declaration");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="declaration"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    const submit = screen.getByRole("button", { name: /submit/i });
    expect(submit).toBeEnabled();
    expect(submit).toHaveTextContent("Submit");
    expect(screen.queryByTestId("preview-submit-hint")).not.toBeInTheDocument();
  });

  it("does NOT show the preview banner on the submission-confirmation step even when isPreview is true", () => {
    const step = makeStep("submission-confirmation");
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="submission-confirmation"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
        isPreview
      />,
    );
    expect(screen.queryByTestId("preview-banner")).not.toBeInTheDocument();
  });

  it("repeat instance marker: a labelled instance renders the caption inside the h1 (GOV.UK pattern)", () => {
    const { getInstanceMarker } = jest.requireMock("@forms/lib");
    (getInstanceMarker as jest.Mock).mockReturnValue({
      text: "Dependent 2",
      hasLabel: true,
    });
    const repeatableBehaviour = {
      type: "repeatable",
      min: 1,
      instanceLabel: "Dependent",
    };
    const step = makeStep("step-1~1", [], [repeatableBehaviour]);
    render(
      <FormRenderer
        form={mockForm}
        formMeta={makeMeta() as any}
        stepId="step-1~1"
        visibleSteps={[step]}
        repeatableStepSettingsRef={mockRepeatableStepSettingsRef as any}
        submissionState={mockSubmissionState as any}
      />,
    );
    const caption = screen.getByTestId("repeat-instance-marker");
    expect(caption).toHaveTextContent("Dependent 2");
    // The caption lives INSIDE the h1 so the accessible name distinguishes
    // instances for screen-reader heading navigation ("Dependent 2 Step …"),
    // matching the GOV.UK caption-in-heading pattern.
    const heading = screen.getByRole("heading", {
      name: "Dependent 2 Step step-1~1",
    });
    expect(heading).toContainElement(caption);
    // No em-dash suffix in the labelled case — the caption carries the marker.
    expect(heading.textContent).not.toContain("—");
  });
});
