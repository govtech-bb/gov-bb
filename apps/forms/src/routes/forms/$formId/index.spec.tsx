/**
 * Unit tests for apps/forms/src/routes/forms/$formId/index.tsx
 *
 * Covers:
 * - RouteComponent renders <FormRenderer /> without crashing
 * - RouteComponent calls Route.useLoaderData() to obtain formMeta
 * - RouteComponent calls getVisibleSteps with the form instance
 * - When getFormData returns saved data, it is merged into useForm defaultValues
 * - restoreRepeatableStepsFromStorage is called when savedFormData is present
 * - restoreRepeatableStepsFromStorage is NOT called when savedFormData is null
 * - stepConditionalTargets entries cause additional useStore calls without crashing
 * - Route.loader calls ensureQueryData twice and returns the FormMeta result
 * - Route.validateSearch accepts { step: "..." } and an empty object
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";

jest.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (routeConfig: any) => ({
    ...routeConfig,
    useLoaderData: jest.fn(),
    useSearch: jest.fn(),
  }),
}));

jest.mock("@tanstack/react-form", () => ({
  useForm: jest.fn(),
  useStore: jest.fn(),
  revalidateLogic: jest.fn(() => jest.fn()),
}));

jest.mock("@forms/lib", () => ({
  getVisibleSteps: jest.fn(),
  // Default: every field is visible, so hiddenFields (the complement) is
  // empty. Tests that pin the complement derivation override per-call.
  getVisibleFields: jest.fn((step: { fields: unknown[] }) => step.fields),
  getFullFieldId: (step: string, field: string) => `${step}_${field}`,
  restoreRepeatableStepsFromStorage: jest.fn(),
  contractQueryOptions: jest.fn(() => ({ queryKey: ["contract"] })),
  formMetaQueryOptions: jest.fn(() => ({ queryKey: ["form-meta"] })),
}));

// Captures the props FormRenderer is last rendered with so tests can assert
// the submissionState the route handler commits. Must be `mock`-prefixed so
// jest's hoisted factory may reference it.
const mockFormRendererProps: { current: any } = { current: undefined };
jest.mock("@forms/components", () => ({
  FormRenderer: (props: any) => {
    mockFormRendererProps.current = props;
    return <div data-testid="form-renderer" />;
  },
  FormError: () => <div data-testid="form-error" />,
}));

jest.mock("../../../lib/session-storage", () => ({
  getFormData: jest.fn(() => null),
  storeFormData: jest.fn(),
  clearFormState: jest.fn(),
  getSubmissionState: jest.fn(() => null),
  storeSubmissionState: jest.fn(),
  clearSubmissionState: jest.fn(),
}));

jest.mock("@forms/form-api", () => ({
  formatDataForSubmission: jest.fn(() => ({})),
  postFormSubmission: jest.fn(),
}));

jest.mock("../../../lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

import { Route } from "./index";
import { useForm, useStore } from "@tanstack/react-form";
import {
  getVisibleSteps,
  getVisibleFields,
  restoreRepeatableStepsFromStorage,
} from "@forms/lib";
import {
  getFormData,
  getSubmissionState,
  clearSubmissionState,
} from "../../../lib/session-storage";
import { trackEvent } from "../../../lib/analytics";

const mockUseForm = useForm as jest.Mock;
const mockUseStore = useStore as jest.Mock;
const mockGetVisibleSteps = getVisibleSteps as jest.Mock;
const mockGetVisibleFields = getVisibleFields as jest.Mock;
const mockGetFormData = getFormData as jest.Mock;
const mockGetSubmissionState = getSubmissionState as jest.Mock;
const mockClearSubmissionState = clearSubmissionState as jest.Mock;
const mockRestoreRepeatableStepsFromStorage =
  restoreRepeatableStepsFromStorage as jest.Mock;

const mockFormMeta = {
  formId: "test-form",
  formTitle: "Test Form",
  steps: [{ stepId: "step1", title: "Step 1", fields: [], behaviours: [] }],
  validationProperties: {},
  contactDetails: undefined,
  defaultValues: {},
  repeatSettings: {},
  stepConditionalTargets: {},
  idempotencyKey: "key-123",
  version: "1.0.0",
};

const mockFormInstance = {
  store: {},
  Field: ({ children }: any) => (
    <>
      {children({
        state: { value: "" },
        handleBlur: jest.fn(),
        handleChange: jest.fn(),
      })}
    </>
  ),
  getFieldValue: jest.fn(),
  validateField: jest.fn().mockResolvedValue([]),
  handleSubmit: jest.fn(),
};

const mockVisibleStep = {
  stepId: "step1",
  title: "Step 1",
  fields: [],
  behaviours: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Route, "useLoaderData").mockReturnValue(mockFormMeta);
  jest.spyOn(Route, "useSearch").mockReturnValue({ step: "step1" });
  mockUseForm.mockReturnValue(mockFormInstance);
  mockUseStore.mockImplementation((_store: any, selector: any) => {
    try {
      return selector ? selector({ values: {} }) : {};
    } catch {
      return {};
    }
  });
  mockGetVisibleSteps.mockReturnValue([mockVisibleStep]);
  mockGetFormData.mockReturnValue(null);
  mockGetSubmissionState.mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("RouteComponent", () => {
  it("renders <FormRenderer /> without crashing", () => {
    render(<Route.component />);
    expect(screen.getByTestId("form-renderer")).toBeInTheDocument();
  });

  it("calls Route.useLoaderData() to get formMeta", () => {
    const spy = jest.spyOn(Route, "useLoaderData");
    render(<Route.component />);
    expect(spy).toHaveBeenCalled();
  });

  it("calls getVisibleSteps with the form instance", () => {
    render(<Route.component />);
    expect(mockGetVisibleSteps).toHaveBeenCalledWith(
      mockFormMeta.steps,
      mockFormInstance,
    );
  });

  it("does NOT call restoreRepeatableStepsFromStorage when savedFormData is null", () => {
    mockGetFormData.mockReturnValue(null);
    render(<Route.component />);
    expect(mockRestoreRepeatableStepsFromStorage).not.toHaveBeenCalled();
  });

  it("calls restoreRepeatableStepsFromStorage when savedFormData is present", () => {
    const savedData = { step1_field1: "saved-value" };
    mockGetFormData.mockReturnValue(savedData);
    render(<Route.component />);
    expect(mockRestoreRepeatableStepsFromStorage).toHaveBeenCalledWith(
      savedData,
      mockFormMeta,
      mockFormMeta.repeatSettings,
    );
  });

  it("merges savedFormData into useForm defaultValues when present", () => {
    const savedData = { step1_field1: "saved-value" };
    mockGetFormData.mockReturnValue(savedData);
    render(<Route.component />);
    expect(mockUseForm).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValues: expect.objectContaining({ step1_field1: "saved-value" }),
      }),
    );
  });

  it("renders without crashing when stepConditionalTargets has entries", () => {
    const metaWithTargets = {
      ...mockFormMeta,
      stepConditionalTargets: {
        step1: "field1",
        step2: "field2",
      },
    };
    jest.spyOn(Route, "useLoaderData").mockReturnValue(metaWithTargets);
    render(<Route.component />);
    expect(screen.getByTestId("form-renderer")).toBeInTheDocument();
  });

  it("passes step from useSearch to FormRenderer as stepId", () => {
    jest.spyOn(Route, "useSearch").mockReturnValue({ step: "step1" });
    render(<Route.component />);
    expect(screen.getByTestId("form-renderer")).toBeInTheDocument();
  });

  it("handles undefined step (no step in search params)", () => {
    jest.spyOn(Route, "useSearch").mockReturnValue({ step: undefined });
    render(<Route.component />);
    expect(screen.getByTestId("form-renderer")).toBeInTheDocument();
  });

  // Refreshing the browser on the confirmation step must keep the user there.
  // submissionState lives in React state (lost on reload), so it is persisted to
  // session storage and rehydrated on mount — otherwise the renderer's
  // "no submissionState → bounce to check-your-answers" guard fires on refresh.
  it("rehydrates submissionState from storage when reloading on submission-confirmation", () => {
    jest
      .spyOn(Route, "useSearch")
      .mockReturnValue({ step: "submission-confirmation" });
    const persisted = {
      hasPayment: false,
      serviceName: "test-form",
      submissionSuccess: true,
      referenceNumber: "REF-9",
      date: "01/01/2026",
    };
    mockGetSubmissionState.mockReturnValue(persisted);

    render(<Route.component />);

    expect(mockFormRendererProps.current.submissionState).toEqual(persisted);
  });

  // Returning from EzPay: the API redirect lands the citizen on the confirmation
  // step with ?payment=success, and the stored (pending) state is flipped to the
  // paid receipt.
  it("flips rehydrated state to paymentSuccess on ?payment=success return", () => {
    jest.spyOn(Route, "useSearch").mockReturnValue({
      step: "submission-confirmation",
      payment: "success",
    });
    mockGetSubmissionState.mockReturnValue({
      hasPayment: true,
      serviceName: "test-form",
      submissionSuccess: true,
      paymentSuccess: false,
      referenceNumber: "REF-9",
      paymentUrl: "https://pay.example.com",
    });

    render(<Route.component />);

    expect(mockFormRendererProps.current.submissionState).toMatchObject({
      hasPayment: true,
      paymentSuccess: true,
      referenceNumber: "REF-9",
    });
  });

  it("passes isPreview=true to FormRenderer when a preview token is in search", () => {
    jest
      .spyOn(Route, "useSearch")
      .mockReturnValue({ step: "step1", preview: "tok" });
    render(<Route.component />);
    expect(mockFormRendererProps.current.isPreview).toBe(true);
  });

  it("passes isPreview=false to FormRenderer when no preview token is in search", () => {
    jest.spyOn(Route, "useSearch").mockReturnValue({ step: "step1" });
    render(<Route.component />);
    expect(mockFormRendererProps.current.isPreview).toBe(false);
  });

  it("ignores and clears any persisted submissionState on a fresh non-confirmation load", () => {
    jest.spyOn(Route, "useSearch").mockReturnValue({ step: "step1" });
    // A stale outcome from an earlier submission this session must not leak into
    // a brand-new form session.
    mockGetSubmissionState.mockReturnValue({
      hasPayment: false,
      serviceName: "test-form",
      submissionSuccess: true,
      referenceNumber: "STALE",
      date: "01/01/2026",
    });

    render(<Route.component />);

    expect(mockFormRendererProps.current.submissionState).toBeUndefined();
    expect(mockClearSubmissionState).toHaveBeenCalledWith("test-form");
  });
});

describe("Route.loader", () => {
  it("calls ensureQueryData twice (contract then form-meta) and returns the FormMeta", async () => {
    const mockQueryClient = {
      ensureQueryData: jest.fn().mockResolvedValue(mockFormMeta),
    };
    const result = await Route.loader({
      params: { formId: "test-form" },
      context: { queryClient: mockQueryClient },
      deps: { preview: undefined },
    } as any);
    expect(mockQueryClient.ensureQueryData).toHaveBeenCalledTimes(2);
    expect(result).toBe(mockFormMeta);
  });

  it("passes formId and undefined preview to contractQueryOptions on first call", async () => {
    const { contractQueryOptions } = jest.requireMock("@forms/lib");
    const mockQueryClient = {
      ensureQueryData: jest.fn().mockResolvedValue(mockFormMeta),
    };
    await Route.loader({
      params: { formId: "test-form" },
      context: { queryClient: mockQueryClient },
      deps: { preview: undefined },
    } as any);
    expect(contractQueryOptions).toHaveBeenCalledWith("test-form", undefined);
  });

  it("passes formId, contract result, and undefined preview to formMetaQueryOptions on second call", async () => {
    const { formMetaQueryOptions } = jest.requireMock("@forms/lib");
    const mockQueryClient = {
      ensureQueryData: jest.fn().mockResolvedValue(mockFormMeta),
    };
    await Route.loader({
      params: { formId: "test-form" },
      context: { queryClient: mockQueryClient },
      deps: { preview: undefined },
    } as any);
    expect(formMetaQueryOptions).toHaveBeenCalledWith(
      "test-form",
      mockFormMeta,
      undefined,
    );
  });

  it("forwards the preview token to formMetaQueryOptions when deps.preview is set", async () => {
    const { formMetaQueryOptions } = jest.requireMock("@forms/lib");
    const mockQueryClient = {
      ensureQueryData: jest.fn().mockResolvedValue(mockFormMeta),
    };
    await Route.loader({
      params: { formId: "test-form" },
      context: { queryClient: mockQueryClient },
      deps: { preview: "s3cret" },
    } as any);
    expect(formMetaQueryOptions).toHaveBeenCalledWith(
      "test-form",
      mockFormMeta,
      "s3cret",
    );
  });

  it("forwards the preview token to contractQueryOptions when deps.preview is set", async () => {
    const { contractQueryOptions } = jest.requireMock("@forms/lib");
    const mockQueryClient = {
      ensureQueryData: jest.fn().mockResolvedValue(mockFormMeta),
    };
    await Route.loader({
      params: { formId: "test-form" },
      context: { queryClient: mockQueryClient },
      deps: { preview: "s3cret" },
    } as any);
    expect(contractQueryOptions).toHaveBeenCalledWith("test-form", "s3cret");
  });
});

describe("Route.loaderDeps", () => {
  it("extracts the preview token from search when present", () => {
    const result = Route.loaderDeps({ search: { preview: "s3cret" } } as any);
    expect(result).toEqual({ preview: "s3cret" });
  });

  it("returns preview as undefined when not present in search", () => {
    const result = Route.loaderDeps({ search: {} } as any);
    expect(result).toEqual({ preview: undefined });
  });
});

describe("Route.validateSearch", () => {
  it("accepts { step: 'step1' } without throwing", () => {
    expect(() => Route.validateSearch({ step: "step1" })).not.toThrow();
  });

  it("accepts an empty object (no step param) without throwing", () => {
    expect(() => Route.validateSearch({})).not.toThrow();
  });

  it("returns an object with the step value when provided", () => {
    const result = Route.validateSearch({ step: "step2" });
    expect(result).toEqual(expect.objectContaining({ step: "step2" }));
  });

  it("returns an object where step is undefined when not provided", () => {
    const result = Route.validateSearch({});
    expect(result.step).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// onSubmit handler — extracted from useForm args after render
// ---------------------------------------------------------------------------

describe("RouteComponent onSubmit handler", () => {
  const { postFormSubmission, formatDataForSubmission } =
    jest.requireMock("@forms/form-api");
  const { storeFormData } = jest.requireMock("../../../lib/session-storage");
  const mockTrackEvent = trackEvent as jest.Mock;

  // Hard-fail if useForm was not called or no onSubmit was supplied. Returning
  // undefined here and having each test do `if (!onSubmit) return;` would
  // silently mark every test as passing with zero assertions if the test
  // setup ever broke.
  function renderAndExtractOnSubmit() {
    render(<Route.component />);
    const useFormArg = mockUseForm.mock.calls[0]?.[0];
    const onSubmit = useFormArg?.onSubmit as
      | ((args: { value: Record<string, unknown> }) => Promise<void>)
      | undefined;
    if (!onSubmit) {
      throw new Error(
        "Test setup failure: useForm was not called with an onSubmit handler. " +
          "Check that Route.component rendered and that the useForm mock is wired.",
      );
    }
    return onSubmit;
  }

  it("calls postFormSubmission with formMeta and formatted data", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "submitted",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await onSubmit({ value: {} });
    expect(postFormSubmission).toHaveBeenCalled();
  });

  it("sets submissionSuccess=true on 'submitted' status", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "submitted",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await expect(onSubmit({ value: {} })).resolves.not.toThrow();
  });

  it("sets submissionSuccess=true on 'success' status", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "success",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await expect(onSubmit({ value: {} })).resolves.not.toThrow();
  });

  it("handles 'pending_payment' with deferred meta by setting hasPayment=true", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "pending_payment",
      meta: {
        deferred: {
          amount: 100,
          paymentUrl: "https://pay.example.com",
          paymentId: "pay-001",
          description: "Application fee",
        },
      },
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await expect(onSubmit({ value: {} })).resolves.not.toThrow();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "form-submit-success",
      expect.objectContaining({ form_id: "test-form" }),
    );
  });

  it("commits a payment-init error state on 'pending_payment' without deferred meta", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "pending_payment",
      // No meta.deferred — the payment could not be initiated.
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await act(async () => {
      await onSubmit({ value: {} });
    });
    // State must be committed (not left undefined) so the confirmation step
    // can render the "Payment could not be initiated" block with the reference
    // number, rather than being redirected away.
    expect(mockFormRendererProps.current.submissionState).toEqual(
      expect.objectContaining({
        hasPayment: true,
        submissionSuccess: true,
        referenceNumber: "ref-001",
      }),
    );
    // No paymentUrl — that is what makes the component show the error block
    // (isSafePaymentUrl(undefined) is false).
    expect(
      mockFormRendererProps.current.submissionState.paymentUrl,
    ).toBeUndefined();
    // Payment could not be initiated — this must not register as a success
    // in analytics (issue #318); it reports a payment-init error instead.
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-success",
      expect.anything(),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "form-submit-error",
      expect.objectContaining({ form_id: "test-form", reason: "payment-init" }),
    );
  });

  it("commits a failed state and fires a server error event on 'failed' status", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "failed",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await act(async () => {
      await onSubmit({ value: {} });
    });
    // submissionSuccess: false routes the confirmation step to the
    // "Something went wrong" panel with a retry — the citizen must not be
    // left frozen with no feedback.
    expect(mockFormRendererProps.current.submissionState).toEqual(
      expect.objectContaining({ submissionSuccess: false }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith("form-submit-error", {
      form_id: "test-form",
      reason: "server",
    });
  });

  it("calls formatDataForSubmission before postFormSubmission", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    if (!onSubmit) return;
    (formatDataForSubmission as jest.Mock).mockReturnValue({
      step1: { name: "test" },
    });
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "submitted",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await onSubmit({ value: { step1_name: "test" } });
    expect(formatDataForSubmission).toHaveBeenCalled();
  });

  it("does NOT trackEvent on 'processing' status (no-op branch)", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "processing",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await onSubmit({ value: {} });
    // The 'processing' branch in index.tsx is a `break;` — no analytics
    // should fire. Asserting absence pins the no-op so a future change
    // that adds side-effects has to update this test.
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-success",
      expect.anything(),
    );
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-error",
      expect.anything(),
    );
  });

  it("does NOT trackEvent on 'draft' status (no-op branch)", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "draft",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await onSubmit({ value: {} });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-success",
      expect.anything(),
    );
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-error",
      expect.anything(),
    );
  });

  it("handles unknown/default status without throwing", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "completely-unknown",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await expect(onSubmit({ value: {} })).resolves.not.toThrow();
  });

  it("tracks form-submit-error with reason 'network' when postFormSubmission rejects", async () => {
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockRejectedValue(
      new Error("network failure"),
    );
    await act(async () => {
      await onSubmit({ value: {} });
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("form-submit-error", {
      form_id: "test-form",
      reason: "network",
    });
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      "form-submit-success",
      expect.anything(),
    );
    // The catch must still commit a failed state so the confirmation step
    // shows the "Something went wrong" panel instead of silently bouncing.
    expect(mockFormRendererProps.current.submissionState).toEqual(
      expect.objectContaining({ submissionSuccess: false }),
    );
  });

  it("filters hidden and conditionally-hidden fields before submission", async () => {
    const stepWithHiddenFields = {
      stepId: "step1",
      title: "Step 1",
      behaviours: [],
      fields: [
        {
          id: "step1_f1",
          fieldId: "f1",
          stepId: "step1",
          name: "f1",
          label: "F1",
          htmlType: "text",
          disabled: false,
          hidden: true,
          conditionallyHidden: false,
          behaviours: [],
        },
        {
          id: "step1_f2",
          fieldId: "f2",
          stepId: "step1",
          name: "f2",
          label: "F2",
          htmlType: "text",
          disabled: false,
          hidden: false,
          conditionallyHidden: true,
          behaviours: [],
        },
        {
          id: "step1_f3",
          fieldId: "f3",
          stepId: "step1",
          name: "f3",
          label: "F3",
          htmlType: "text",
          disabled: false,
          hidden: false,
          conditionallyHidden: false,
          behaviours: [],
        },
      ],
    };
    mockGetVisibleSteps.mockReturnValue([stepWithHiddenFields]);
    // #737: hiddenFields is the complement of the evaluated visible set,
    // not a read of the render-mutated conditionallyHidden flag. Here the
    // evaluator says only f3 is visible, so f1 and f2 must be stripped.
    mockGetVisibleFields.mockReturnValueOnce([stepWithHiddenFields.fields[2]]);
    const onSubmit = renderAndExtractOnSubmit();
    (postFormSubmission as jest.Mock).mockResolvedValue({
      status: "submitted",
      data: {
        id: "ref-001",
        submittedAt: "2026-05-22T00:00:00Z",
        formId: "test-form",
      },
    });
    await onSubmit({ value: {} });
    expect(mockGetVisibleFields).toHaveBeenCalledWith(
      stepWithHiddenFields,
      mockFormInstance,
    );
    // Inspect the actual hiddenFields arg passed to formatDataForSubmission
    // rather than just confirming the function was called. An inverted
    // filter (visible fields instead of their complement) would still
    // trigger the call, so without this the test pins nothing.
    expect(formatDataForSubmission).toHaveBeenCalledTimes(1);
    const [, , hiddenFieldsArg] = (formatDataForSubmission as jest.Mock).mock
      .calls[0];
    const hiddenIds = (hiddenFieldsArg as Array<{ id: string }>).map(
      (f) => f.id,
    );
    expect(hiddenIds.sort()).toEqual(["step1_f1", "step1_f2"]);
    expect(hiddenIds).not.toContain("step1_f3");
  });

  describe("clears persisted state on a successful submission", () => {
    const { clearFormState } = jest.requireMock("../../../lib/session-storage");

    const okData = {
      id: "ref-001",
      submittedAt: "2026-05-22T00:00:00Z",
      formId: "test-form",
    };

    it("clears form state on a 'submitted' success", async () => {
      const onSubmit = renderAndExtractOnSubmit();
      (postFormSubmission as jest.Mock).mockResolvedValue({
        status: "submitted",
        data: okData,
      });
      await onSubmit({ value: {} });
      expect(clearFormState).toHaveBeenCalledWith("test-form");
    });

    it("clears form state on a 'pending_payment' with payment details (success)", async () => {
      const onSubmit = renderAndExtractOnSubmit();
      (postFormSubmission as jest.Mock).mockResolvedValue({
        status: "pending_payment",
        meta: {
          deferred: {
            amount: 100,
            paymentUrl: "https://pay.example.com",
            paymentId: "pay-001",
            description: "Fee",
          },
        },
        data: okData,
      });
      await onSubmit({ value: {} });
      expect(clearFormState).toHaveBeenCalledWith("test-form");
    });

    it("does NOT clear form state on a 'failed' submission", async () => {
      const onSubmit = renderAndExtractOnSubmit();
      (postFormSubmission as jest.Mock).mockResolvedValue({
        status: "failed",
        data: okData,
      });
      await act(async () => {
        await onSubmit({ value: {} });
      });
      expect(clearFormState).not.toHaveBeenCalled();
    });

    it("does NOT clear form state when payment could not be initiated (answers kept for retry)", async () => {
      const onSubmit = renderAndExtractOnSubmit();
      (postFormSubmission as jest.Mock).mockResolvedValue({
        status: "pending_payment",
        // No meta.deferred — payment-init error, which keeps a Try again path.
        data: okData,
      });
      await act(async () => {
        await onSubmit({ value: {} });
      });
      expect(clearFormState).not.toHaveBeenCalled();
    });

    it("does NOT clear form state when the request rejects (network error)", async () => {
      const onSubmit = renderAndExtractOnSubmit();
      (postFormSubmission as jest.Mock).mockRejectedValue(
        new Error("network failure"),
      );
      await act(async () => {
        await onSubmit({ value: {} });
      });
      expect(clearFormState).not.toHaveBeenCalled();
    });
  });

  void storeFormData;
});
