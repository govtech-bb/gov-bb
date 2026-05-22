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

jest.mock("./field-renderer", () => ({
  __esModule: true,
  default: ({ field }: { field: { id: string } }) => (
    <div data-testid="field-renderer" data-field-id={field.id} />
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

jest.mock("../lib/design-system", () => ({
  __esModule: true,
  default: {
    formRoot: "",
    formTitle: "",
    formStep: "",
    formNavigation: "",
    formStepDescription: "",
  },
}));

jest.mock("@forms/lib", () => ({
  getFullFieldId: (step: string, field: string) => `${step}_${field}`,
  addRepeatableStep: jest.fn(() => []),
  removeRepeatableStep: jest.fn(() => []),
  stepFieldIdConcactenator: "_",
  repeatStepConcactenator: "~",
  getRepeatStepCount: jest.fn(() => undefined),
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
  getFieldValue: jest.fn(),
  validateField: jest.fn().mockResolvedValue([]),
  handleSubmit: jest.fn(),
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
  jest.clearAllMocks();
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
      "change",
    );
    expect(mockCompleteAndContinue).toHaveBeenCalledWith("step-1");
  });

  it("clicking Submit calls form.handleSubmit and completeAndContinue", async () => {
    const user = userEvent.setup();
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
});
