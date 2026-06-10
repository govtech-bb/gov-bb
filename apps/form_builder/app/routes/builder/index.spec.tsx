/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { createElement, type ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

// TanStack Start's createServerFn / react-router are ESM-only and pull network
// at module-eval. The component only reads `Route.useLoaderData()` /
// `Route.useSearch()` and `useNavigate`, so a minimal shim is enough to render
// BuilderPage in jsdom.
jest.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useLoaderData: () => ({ catalog: CATALOG, baseBranch: "dev" }),
    useSearch: () => ({}),
  }),
  useNavigate: () => jest.fn(),
}));

// validateRecipe is the only server fn a Save-draft click reaches (and only on
// the valid path); the rest are mocked so importing the route doesn't attempt a
// real RPC. previewRecipe is threaded out the same way so the Preview-modal
// tests can drive its success/failure paths.
const validateRecipe = jest.fn();
const previewRecipe = jest.fn();
jest.mock("../../server/registry", () => ({
  getCatalogFn: jest.fn(),
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
  previewRecipe: (...args: unknown[]) => previewRecipe(...args),
}));
const getRecipe = jest.fn();
const rekeyRecipe = jest.fn();
const submitRecipe = jest.fn();
const updateRecipe = jest.fn();
// Always resolve to "no selection" by default so the picker's Promise.all
// load path works; individual tests can override per case.
const getFormConfig = jest.fn((..._args: unknown[]) =>
  Promise.resolve({ mdaContactId: null, processors: null }),
);
jest.mock("../../server/forms", () => ({
  submitRecipe: (...args: unknown[]) => submitRecipe(...args),
  updateRecipe: (...args: unknown[]) => updateRecipe(...args),
  rekeyRecipe: (...args: unknown[]) => rekeyRecipe(...args),
  deleteForm: jest.fn(),
  disableForm: jest.fn(),
  enableForm: jest.fn(),
  getRecipe: (...args: unknown[]) => getRecipe(...args),
  getFormConfig: (...args: unknown[]) => getFormConfig(...args),
}));
// MDA contact directory (issue #607) — stub the server fn and the hook so the
// contact-details dropdown doesn't pull a real RPC at module-eval.
jest.mock("../../server/mda-contacts", () => ({
  listMdaContacts: jest.fn(() => Promise.resolve([])),
  createMdaContact: jest.fn(),
}));
jest.mock("./-use-mda-contacts", () => ({
  useMdaContacts: () => ({
    contacts: [],
    loadError: null,
    refetch: jest.fn(),
    upsertContact: jest.fn(),
  }),
}));
jest.mock("../../server/publish", () => ({
  publishRecipe: jest.fn(),
  getPublishBaseBranch: jest.fn(),
}));
// The AI sidebar's convert server-fns are createServerFn; stub them so
// importing the editor doesn't pull a real RPC at module-eval. `editRecipe` is
// the one the Edit Form flow reaches, so route it through a swappable spy.
const editRecipe = jest.fn();
jest.mock("../../server/ai-builder/convert", () => ({
  convertRecipe: jest.fn(),
  getAiStatus: jest.fn(),
  editRecipe: (...args: unknown[]) => editRecipe(...args),
  presignPdfUpload: jest.fn(),
  startPdfConvert: jest.fn(),
  getPdfConvertStatus: jest.fn(),
}));

// The Open picker's forms list is a slow GitHub-API waterfall; stub it out.
// `mockForms` is swappable per test so we can drive the uniqueness pre-flight.
// `refetch`/`upsertForm` are stable spies so the save-flow tests can assert
// which branch fired (full refetch for a new form, cheap upsert for a re-save).
let mockForms: { id: string; formId: string; title: string; version: string; isPublished: boolean }[] = [];
const mockRefetch = jest.fn();
const mockUpsertForm = jest.fn();
jest.mock("./-use-forms-list", () => ({
  useFormsList: () => ({
    forms: mockForms,
    loadError: null,
    refetch: mockRefetch,
    upsertForm: mockUpsertForm,
  }),
}));

// Keep the real reducer logic, but make EMPTY_DRAFT (the useReducer seed)
// swappable per test so we can render an invalid vs a valid starting draft.
let mockEmptyDraft: RecipeDraft;
jest.mock("./-recipe-reducer", () => {
  const actual = jest.requireActual("./-recipe-reducer");
  return {
    __esModule: true,
    ...actual,
    get EMPTY_DRAFT() {
      return mockEmptyDraft;
    },
  };
});

// Catalog-dependent helpers are stubbed so the valid path doesn't depend on a
// populated registry catalog. serializeRecipeDraft stays real: it's catalog-
// free and pure (it strips editor-only field ids), and the unsaved-changes
// tests rely on `draftsEqual` — which serializes both drafts — to discriminate
// edited drafts from the saved baseline. No test inspects the serialized recipe.
// findRecipeIdCollisions is swappable per test (default: no collisions) so the
// AI apply path's collision pre-flight can be driven. formatCollisionIssues
// stays real, so its message text is asserted directly.
let mockCollisions: ReturnType<
  typeof import("@govtech-bb/form-builder").findRecipeIdCollisions
> = { fieldIdCollisions: [], stepIdCollisions: [] };
jest.mock("@govtech-bb/form-builder", () => {
  const actual = jest.requireActual("@govtech-bb/form-builder");
  return {
    ...actual,
    findRecipeIdCollisions: () => mockCollisions,
    resolveFieldIds: () => [],
  };
});

const CATALOG: RegistryCatalog = { components: [], blocks: [], custom: [] };

// Only the two required steps — no editable step, so validation fails its first
// pre-flight check ("add at least one step").
const INVALID_DRAFT: RecipeDraft = {
  formId: "",
  title: "",
  steps: [
    { stepId: "declaration", title: "Declaration", fields: [], behaviours: [] },
    {
      stepId: "submission-confirmation",
      title: "Submission Confirmation",
      fields: [],
      behaviours: [],
    },
  ],
};

// Invalid (no editable step ⇒ fails the "add at least one step" pre-flight) but
// non-empty, so it reads as having unsaved changes. Save draft is now gated on
// unsaved changes, so the "save an invalid draft anyway for review" flow needs a
// dirty draft — a wholly-empty form has nothing to save.
const DIRTY_INVALID_DRAFT: RecipeDraft = {
  formId: "in-progress",
  title: "In Progress",
  steps: [
    { stepId: "declaration", title: "Declaration", fields: [], behaviours: [] },
    {
      stepId: "submission-confirmation",
      title: "Submission Confirmation",
      fields: [],
      behaviours: [],
    },
  ],
};

// One editable step carrying a field, so every pre-flight check passes and the
// (stubbed) server validate decides the outcome.
// Steps are in the reducer's canonical [...editable, ...required] order with
// every required step present, so it models a real editor draft: LOAD_DRAFT
// leaves it unchanged, and draftsEqual round-trips it cleanly (no false
// "unsaved changes" after a save → edit → discard).
const VALID_DRAFT: RecipeDraft = {
  formId: "test-form",
  title: "Test Form",
  steps: [
    {
      stepId: "step-1",
      title: "Step 1",
      fields: [
        { id: "f1", kind: "component", ref: "components/first-name", overrides: {} },
      ],
      behaviours: [],
    },
    { stepId: "check-your-answers", title: "Check your answers", fields: [], behaviours: [] },
    { stepId: "declaration", title: "Declaration", fields: [], behaviours: [] },
    {
      stepId: "submission-confirmation",
      title: "Submission Confirmation",
      fields: [],
      behaviours: [],
    },
  ],
};

// A complete author-time payment config — every required field filled.
const COMPLETE_PAYMENT_CONFIG = {
  provider: "ezpay" as const,
  department: "Treasury",
  paymentCode: "FEE-001",
  amount: 50,
  description: "Application fee",
  customerEmailPath: "applicant.email",
  customerNamePath: "applicant.fullName",
};

// VALID_DRAFT carrying a payment processor whose config is incomplete (the empty
// strings makeDefaultProcessor seeds) — the save must be blocked.
const DRAFT_WITH_INCOMPLETE_PAYMENT: RecipeDraft = {
  ...VALID_DRAFT,
  processors: [
    {
      id: "pay-1",
      type: "payment",
      config: {
        provider: "ezpay",
        department: "",
        paymentCode: "",
        amount: 0,
        description: "",
        customerEmailPath: "",
        customerNamePath: "",
      },
    },
  ],
} as RecipeDraft;

// Same draft but with a complete payment config — the save must proceed.
const DRAFT_WITH_COMPLETE_PAYMENT: RecipeDraft = {
  ...VALID_DRAFT,
  processors: [{ id: "pay-1", type: "payment", config: COMPLETE_PAYMENT_CONFIG }],
} as RecipeDraft;

function renderBuilder() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Route } = require("./index") as {
    Route: { component: () => ReactElement };
  };
  return render(createElement(Route.component));
}

describe("BuilderPage — validate on Save draft click", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    validateRecipe.mockReset();
    mockForms = [];
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it(
    "surfaces errors and leaves the SubmitModal closed when the draft is invalid and the user cancels the confirm",
    async () => {
      mockEmptyDraft = DIRTY_INVALID_DRAFT;
      confirmSpy.mockReturnValue(false);
      renderBuilder();

      await userEvent.click(
        screen.getByRole("button", { name: /save draft/i }),
      );

      expect(
        await screen.findByText(/add at least one step/i),
      ).toBeInTheDocument();
      // User declined the "save anyway?" prompt, so the modal stays closed.
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Submit Recipe")).not.toBeInTheDocument();
      // Pre-flight fails before the server is ever asked.
      expect(validateRecipe).not.toHaveBeenCalled();
    },
    // Heavy render + userEvent flow; 15s flakes under CI's concurrent test
    // load (passes locally well under the limit). 30s gives headroom. See #625.
    30_000,
  );

  it(
    "opens the SubmitModal when the draft is invalid but the user confirms the save-anyway prompt",
    async () => {
      mockEmptyDraft = DIRTY_INVALID_DRAFT;
      confirmSpy.mockReturnValue(true);
      renderBuilder();

      await userEvent.click(
        screen.getByRole("button", { name: /save draft/i }),
      );

      // Errors still surface in the panel...
      expect(
        await screen.findByText(/add at least one step/i),
      ).toBeInTheDocument();
      // ...and on confirm, the version-entry modal opens just like a valid save.
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText("Submit Recipe", { selector: "strong" }),
      ).toBeInTheDocument();
    },
    // Heavy render + userEvent flow; 15s flakes under CI's concurrent test
    // load (passes locally well under the limit). 30s gives headroom. See #625.
    30_000,
  );

  it("opens the SubmitModal on click when validation passes, without prompting", async () => {
    mockEmptyDraft = VALID_DRAFT;
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

    // The modal renders "Submit Recipe" as both its heading and its submit
    // button; the heading (a <strong>) is the unambiguous "modal is open" signal.
    expect(
      await screen.findByText("Submit Recipe", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(validateRecipe).toHaveBeenCalledTimes(1);
    // Valid drafts must never trigger the confirm prompt.
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it(
    "hard-gates Save draft on a title collision: error shown, modal closed, no save-anyway",
    async () => {
      // An otherwise-valid new form whose title collides with another form.
      mockEmptyDraft = VALID_DRAFT;
      mockForms = [
        {
          id: "other",
          formId: "other-form",
          title: "Test Form",
          version: "1.0.0",
          isPublished: true,
        },
      ];
      renderBuilder();

      await userEvent.click(
        screen.getByRole("button", { name: /save draft/i }),
      );

      expect(
        await screen.findByText(/already exists. Choose a different title/i),
      ).toBeInTheDocument();
      // Collision is a hard gate — unlike contract errors, there's no
      // "save anyway" confirm and the server is never asked.
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(validateRecipe).not.toHaveBeenCalled();
      expect(screen.queryByText("Submit Recipe")).not.toBeInTheDocument();
    },
    // Heavy render + userEvent flow; 15s flakes under CI's concurrent test
    // load (passes locally well under the limit). 30s gives headroom. See #625.
    30_000,
  );
});

describe("BuilderPage — incomplete payment config blocks save", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    validateRecipe.mockReset();
    submitRecipe.mockReset();
    mockForms = [];
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it(
    "blocks Save draft, surfaces an inline error, and sends no request when a payment processor is incomplete",
    async () => {
      mockEmptyDraft = DRAFT_WITH_INCOMPLETE_PAYMENT;
      validateRecipe.mockResolvedValue({ ok: true });
      renderBuilder();

      await userEvent.click(
        screen.getByRole("button", { name: /save draft/i }),
      );

      // Inline error surfaces in the always-visible validation panel...
      expect(
        await screen.findByText(/payment processor is incomplete/i),
      ).toBeInTheDocument();
      // ...the modal never opens, no save-anyway prompt fires (hard gate)...
      expect(screen.queryByText("Submit Recipe")).not.toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      // ...and the server is never asked to validate or save.
      expect(validateRecipe).not.toHaveBeenCalled();
      expect(submitRecipe).not.toHaveBeenCalled();
    },
    30_000,
  );

  it(
    "lets Save draft proceed when every payment processor is complete",
    async () => {
      mockEmptyDraft = DRAFT_WITH_COMPLETE_PAYMENT;
      validateRecipe.mockResolvedValue({ ok: true });
      renderBuilder();

      await userEvent.click(
        screen.getByRole("button", { name: /save draft/i }),
      );

      // No payment error, and the save flow reaches the modal + server validate.
      expect(
        screen.queryByText(/payment processor is incomplete/i),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByText("Submit Recipe", { selector: "strong" }),
      ).toBeInTheDocument();
      expect(validateRecipe).toHaveBeenCalledTimes(1);
    },
    30_000,
  );
});

describe("BuilderPage — formId/title pre-flight on Validate", () => {
  beforeEach(() => {
    validateRecipe.mockReset();
    mockForms = [];
  });

  it("surfaces 'Form ID is required' for an empty formId and never asks the server", async () => {
    mockEmptyDraft = { ...VALID_DRAFT, formId: "" };
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));

    expect(
      await screen.findByText(/form id is required/i),
    ).toBeInTheDocument();
    expect(validateRecipe).not.toHaveBeenCalled();
  });

  it("surfaces the kebab-case hint for a malformed formId", async () => {
    mockEmptyDraft = { ...VALID_DRAFT, formId: "Bad-Id-" };
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));

    expect(
      await screen.findByText(/lowercase letters, numbers, and hyphens only/i),
    ).toBeInTheDocument();
    expect(validateRecipe).not.toHaveBeenCalled();
  });

  it("surfaces 'Title is required' for an empty title", async () => {
    mockEmptyDraft = { ...VALID_DRAFT, title: "" };
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(validateRecipe).not.toHaveBeenCalled();
  });

  it("reports both an empty formId and an empty title together", async () => {
    mockEmptyDraft = { ...VALID_DRAFT, formId: "", title: "" };
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));

    expect(
      await screen.findByText(/form id is required/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
    expect(validateRecipe).not.toHaveBeenCalled();
  });

  it("passes the formId/title pre-flight and reaches the server for a valid draft", async () => {
    mockEmptyDraft = VALID_DRAFT;
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^validate$/i }));

    expect(validateRecipe).toHaveBeenCalledTimes(1);
  });
});

describe("BuilderPage — unsaved changes + Discard", () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    mockForms = [];
    validateRecipe.mockReset();
    getRecipe.mockReset();
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  function discardButton() {
    return screen.getByRole("button", { name: /discard/i });
  }
  function saveDraftButton() {
    return screen.getByRole("button", { name: /save draft/i });
  }
  function titleInput() {
    return screen.getByLabelText(/title/i);
  }

  it("shows no unsaved indicator and disables Discard + Save draft for a brand-new empty form", () => {
    mockEmptyDraft = INVALID_DRAFT; // empty form: formId/title blank, no editable step
    renderBuilder();

    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    expect(discardButton()).toBeDisabled();
    expect(saveDraftButton()).toBeDisabled();
  });

  it("surfaces the unsaved indicator and enables Save draft after a manual edit on a fresh form", () => {
    mockEmptyDraft = INVALID_DRAFT;
    renderBuilder();

    fireEvent.change(titleInput(), { target: { value: "My New Form" } });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(saveDraftButton()).toBeEnabled();
  });

  it("disables Deploy while the draft has unsaved changes (#331)", () => {
    mockEmptyDraft = VALID_DRAFT; // dirty, never saved ⇒ unsaved changes
    renderBuilder();

    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("clears the form when Discard is confirmed and there is no saved baseline", () => {
    mockEmptyDraft = VALID_DRAFT; // dirty but never saved/loaded ⇒ no baseline
    renderBuilder();

    fireEvent.change(titleInput(), { target: { value: "Edited Title" } });
    fireEvent.click(discardButton());

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // No baseline to revert to, so Discard clears the form (same as New).
    expect(titleInput()).toHaveValue("");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("reverts to the saved baseline when Discard is confirmed after a save", async () => {
    mockEmptyDraft = VALID_DRAFT; // baseline title "Test Form"
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    // Save the draft so it becomes the baseline; the indicator then clears.
    await userEvent.click(saveDraftButton());
    await userEvent.click(
      await screen.findByRole("button", { name: "Submit Recipe" }),
    );
    await screen.findByText(/recipe submitted successfully/i);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    // Edit ⇒ unsaved again.
    fireEvent.change(titleInput(), { target: { value: "Edited Title" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    // Discard ⇒ back to the saved title, indicator clears.
    fireEvent.click(discardButton());
    expect(titleInput()).toHaveValue("Test Form");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("keeps the edit when the Discard confirm is declined", () => {
    mockEmptyDraft = VALID_DRAFT;
    confirmSpy.mockReturnValue(false);
    renderBuilder();

    fireEvent.change(titleInput(), { target: { value: "Edited Title" } });
    fireEvent.click(discardButton());

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(titleInput()).toHaveValue("Edited Title");
  });

  it("does not flag unsaved changes right after loading a recipe that lacks a required step", async () => {
    // An older recipe with no check-your-answers step; LOAD_DRAFT back-fills it,
    // so the baseline must be the *normalized* draft, not the raw loaded one —
    // otherwise the form reads as dirty the instant it opens.
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: true },
    ];
    getRecipe.mockResolvedValue({
      formId: "old-form",
      title: "Old Form",
      version: "2.0.0",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/first-name" }],
          behaviours: [],
        },
        { stepId: "declaration", title: "Declaration", elements: [], behaviours: [] },
        {
          stepId: "submission-confirmation",
          title: "Submission Confirmation",
          elements: [],
          behaviours: [],
        },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));

    // Once the load has applied (toolbar Form ID reflects it)…
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();
    // …a freshly loaded form has no unsaved changes.
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });
});

describe("BuilderPage — Open picker freshness after save", () => {
  beforeEach(() => {
    mockForms = [];
    validateRecipe.mockReset();
    getRecipe.mockReset();
    mockRefetch.mockClear();
    mockUpsertForm.mockClear();
    submitRecipe.mockReset();
    updateRecipe.mockReset();
  });

  it("full-refetches the picker (no upsert) after saving a brand-new form", async () => {
    mockEmptyDraft = VALID_DRAFT; // never loaded ⇒ a genuine create
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    // A brand-new form picks its initial version, so the field stays editable
    // here — the read-only pin only applies to the Save Changes (update) path.
    const newVersionField = await screen.findByDisplayValue("1.0.0");
    expect(newVersionField).not.toHaveAttribute("readonly");
    await userEvent.click(
      await screen.findByRole("button", { name: "Submit Recipe" }),
    );
    await screen.findByText(/recipe submitted successfully/i);

    // A new form needs the server-merged row, so the slow refetch is acceptable…
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    // …and the cheap upsert path must not also fire.
    expect(mockUpsertForm).not.toHaveBeenCalled();
    // A brand-new form is a create (POST), never an in-place update.
    expect(submitRecipe).toHaveBeenCalledTimes(1);
    expect(updateRecipe).not.toHaveBeenCalled();
  });

  it("overwrites the loaded draft in place (PUT, same version) and upserts the picker row without a refetch", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: true },
    ];
    getRecipe.mockResolvedValue({
      formId: "old-form",
      title: "Old Form",
      version: "2.0.0",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/first-name" }],
          behaviours: [],
        },
        { stepId: "check-your-answers", title: "Check your answers", elements: [], behaviours: [] },
        { stepId: "declaration", title: "Declaration", elements: [], behaviours: [] },
        {
          stepId: "submission-confirmation",
          title: "Submission Confirmation",
          elements: [],
          behaviours: [],
        },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    // Load the existing form so the save reads as a re-save (formId unchanged).
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();

    // Edit the title so the form is dirty (Save draft is gated on unsaved
    // changes) and the upsert has a fresh title to carry into the picker row.
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Old Form (renamed)" },
    });

    // Save Changes now defaults to the loaded version (2.0.0), so the save
    // overwrites the draft in place rather than minting a new patch row (#329).
    // A loaded form's modal reads "Save Changes" rather than "Submit Recipe".
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await screen.findByText(/recipe submitted successfully/i);

    // The same-version save routes through updateRecipe (PUT, overwrite), never
    // submitRecipe (POST create) — so no duplicate draft is created.
    expect(updateRecipe).toHaveBeenCalledTimes(1);
    expect(submitRecipe).not.toHaveBeenCalled();

    // Re-save patches just this row client-side — no slow listForms() waterfall.
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockUpsertForm).toHaveBeenCalledTimes(1);
    expect(mockUpsertForm).toHaveBeenCalledWith({
      // The server-assigned id ("old") is preserved, not replaced with formId.
      id: "old",
      formId: "old-form",
      title: "Old Form (renamed)",
      // The version is unchanged — Save Changes overwrites in place at 2.0.0.
      version: "2.0.0",
      // An in-place same-version save leaves the published row winning the
      // version tie, so the badge stays.
      isPublished: true,
    });
  });

  it("renders the Version field read-only on Save Changes — the version can't be forked from the modal", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: true },
    ];
    getRecipe.mockResolvedValue({
      formId: "old-form",
      title: "Old Form",
      version: "2.0.0",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/first-name" }],
          behaviours: [],
        },
        { stepId: "check-your-answers", title: "Check your answers", elements: [], behaviours: [] },
        { stepId: "declaration", title: "Declaration", elements: [], behaviours: [] },
        {
          stepId: "submission-confirmation",
          title: "Submission Confirmation",
          elements: [],
          behaviours: [],
        },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();

    // Dirty the form so Save draft enables, then open the Save Changes modal.
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Old Form (tweaked)" },
    });
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

    // The Version field is pinned to the loaded version and read-only: Save
    // Changes always overwrites in place, so there's no fork-a-new-version path
    // from this modal (Deploy is the way to cut a new version).
    const versionField = await screen.findByDisplayValue("2.0.0");
    expect(versionField).toHaveAttribute("readonly");
  });

  it("overwrites in place on every consecutive Save Changes — no duplicate drafts (#329)", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: false },
    ];
    getRecipe.mockResolvedValue({
      formId: "old-form",
      title: "Old Form",
      version: "2.0.0",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/first-name" }],
          behaviours: [],
        },
        { stepId: "check-your-answers", title: "Check your answers", elements: [], behaviours: [] },
        { stepId: "declaration", title: "Declaration", elements: [], behaviours: [] },
        {
          stepId: "submission-confirmation",
          title: "Submission Confirmation",
          elements: [],
          behaviours: [],
        },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();

    const titleField = screen.getByLabelText(/title/i);

    // First edit + Save: defaults to 2.0.0, overwrites in place (PUT).
    fireEvent.change(titleField, { target: { value: "Old Form (edit 1)" } });
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await screen.findByText(/recipe submitted successfully/i);

    // Second edit + Save: still defaults to 2.0.0 (the save didn't bump it), so
    // it overwrites the same row again rather than minting 2.0.1.
    fireEvent.change(titleField, { target: { value: "Old Form (edit 2)" } });
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await screen.findAllByText(/recipe submitted successfully/i);

    // Both saves are PUTs at the unchanged version; no POST ever fires, so the
    // backend keeps exactly one 2.0.0 draft instead of accumulating duplicates.
    expect(updateRecipe).toHaveBeenCalledTimes(2);
    expect(submitRecipe).not.toHaveBeenCalled();
    // Both PUTs target the same loaded row (same formId), confirming the second
    // save overwrote the first rather than branching to a new draft.
    const targetedFormIds = updateRecipe.mock.calls.map(
      ([arg]) => arg.data.formId,
    );
    expect(new Set(targetedFormIds).size).toBe(1);
  });
});

describe("BuilderPage — re-key (changing a loaded form's ID)", () => {
  // A complete, canonical-order recipe for `formId` so loading it leaves the
  // draft non-dirty and every save pre-flight passes.
  function loadedRecipe(formId: string, title: string) {
    return {
      formId,
      title,
      version: "2.0.0",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/first-name" }],
          behaviours: [],
        },
        { stepId: "check-your-answers", title: "Check your answers", elements: [], behaviours: [] },
        { stepId: "declaration", title: "Declaration", elements: [], behaviours: [] },
        {
          stepId: "submission-confirmation",
          title: "Submission Confirmation",
          elements: [],
          behaviours: [],
        },
      ],
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
  }

  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    mockForms = [];
    validateRecipe.mockReset();
    getRecipe.mockReset();
    rekeyRecipe.mockReset();
    submitRecipe.mockReset();
    mockRefetch.mockClear();
    mockUpsertForm.mockClear();
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it("does not route a cleared Form ID through rekeyRecipe (an empty id is not a re-key)", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: false },
    ];
    getRecipe.mockResolvedValue(loadedRecipe("old-form", "Old Form"));
    // Server validate fails (empty id), but the user picks "save anyway", so
    // handleSubmit still runs — and must not treat the empty id as a re-key.
    validateRecipe.mockResolvedValue({
      valid: false,
      issues: [{ path: "formId", message: "Form ID is required" }],
    });
    submitRecipe.mockResolvedValue(undefined);
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();

    // Clear the Form ID, then save-anyway through the confirm.
    fireEvent.change(screen.getByDisplayValue("old-form"), {
      target: { value: "" },
    });
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await screen.findByText(/recipe submitted successfully/i);

    // An empty id is never a re-key — the rekey endpoint must not be hit.
    expect(rekeyRecipe).not.toHaveBeenCalled();
  }, 30_000);

  it("re-keys via rekeyRecipe and full-refetches when a draft form's ID changes", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "old", formId: "old-form", title: "Old Form", version: "2.0.0", isPublished: false },
    ];
    getRecipe.mockResolvedValue(loadedRecipe("old-form", "Old Form"));
    validateRecipe.mockResolvedValue({ ok: true });
    rekeyRecipe.mockResolvedValue(undefined);
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Old Form"));
    expect(await screen.findByDisplayValue("old-form")).toBeInTheDocument();

    // Change the Form ID — this turns the next save into a re-key.
    fireEvent.change(screen.getByDisplayValue("old-form"), {
      target: { value: "old-form-renamed" },
    });

    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Save Changes" }),
    );
    await screen.findByText(/recipe submitted successfully/i);

    // The save routed through the dedicated re-key endpoint, carrying the
    // *old* id so the API can move the rows.
    expect(rekeyRecipe).toHaveBeenCalledTimes(1);
    expect(rekeyRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ oldFormId: "old-form" }),
      }),
    );
    // A re-key needs the full refetch (old-id row must vanish) — never the
    // one-row upsert.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(mockUpsertForm).not.toHaveBeenCalled();
  }, 30_000);

  it("pre-blocks re-keying a published form and never calls rekeyRecipe", async () => {
    mockEmptyDraft = INVALID_DRAFT;
    mockForms = [
      { id: "pub", formId: "pub-form", title: "Pub Form", version: "2.0.0", isPublished: true },
    ];
    getRecipe.mockResolvedValue(loadedRecipe("pub-form", "Pub Form"));
    validateRecipe.mockResolvedValue({ ok: true });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    await userEvent.click(await screen.findByText("Pub Form"));
    expect(await screen.findByDisplayValue("pub-form")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("pub-form"), {
      target: { value: "pub-form-renamed" },
    });

    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));

    // The published guard is a hard gate: the error surfaces, the server is
    // never validated, and no re-key is attempted.
    expect(
      await screen.findByText(/cannot change the id of a published form/i),
    ).toBeInTheDocument();
    expect(rekeyRecipe).not.toHaveBeenCalled();
    expect(validateRecipe).not.toHaveBeenCalled();
  }, 30_000);
});

describe("BuilderPage — Preview modal recipe JSON (#744)", () => {
  beforeEach(() => {
    previewRecipe.mockReset();
    mockForms = [];
  });

  // This block is the only one that arms previewRecipe; reset on the way out
  // so a future preview-triggering test can't inherit a stale armed mock.
  afterEach(() => {
    previewRecipe.mockReset();
  });

  it("offers View recipe JSON even when the preview request fails", async () => {
    mockEmptyDraft = VALID_DRAFT;
    previewRecipe.mockRejectedValue(new Error("preview boom"));
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

    // The recipe is captured before the request fires, so the JSON action is
    // available exactly when debugging matters most — when preview fails.
    expect(await screen.findByText(/preview boom/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view recipe json/i }),
    ).toBeInTheDocument();
  }, 30_000);

  it("offers View recipe JSON alongside a successful preview", async () => {
    mockEmptyDraft = VALID_DRAFT;
    previewRecipe.mockResolvedValue({
      formId: "test-form",
      title: "Test Form",
      version: "0.0.1",
      steps: [],
    });
    renderBuilder();

    await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

    expect(
      await screen.findByText("Test Form", { selector: "div *" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view recipe json/i }),
    ).toBeInTheDocument();
  }, 30_000);
});

// #1051: an AI-generated recipe that fails contract validation or has an id
// collision must LOAD into the builder with the defects surfaced in the
// validation panel, rather than being hard-rejected so the draft never appears.
// Only a structurally-unreadable recipe (buildLoadArgs throws) or a failed
// validate *request* stay hard errors. These drive the real AiSidebar's Edit
// Form flow, which routes through the route's internal `applyAiRecipe`.
describe("BuilderPage — AI apply loads with a warning (#1051)", () => {
  let confirmSpy: jest.SpyInstance;

  // A recipe that deserializes to a draft different from VALID_DRAFT, so the
  // no-op guard passes and the apply proceeds. Empty `elements` keeps
  // deserialize off crypto.randomUUID.
  const EDITED_RECIPE = {
    formId: "edited-form",
    title: "Edited Form",
    version: "1.0.1",
    steps: [{ stepId: "step-1", title: "Step 1", elements: [] }],
  };

  // The draft EDITED_RECIPE deserializes to — used to seed an unchanged-draft
  // (no-op) case.
  const EDITED_DRAFT: RecipeDraft = {
    formId: "edited-form",
    title: "Edited Form",
    steps: [{ stepId: "step-1", title: "Step 1", fields: [], behaviours: [] }],
  };

  beforeEach(() => {
    editRecipe.mockReset();
    validateRecipe.mockReset();
    mockForms = [];
    mockCollisions = { fieldIdCollisions: [], stepIdCollisions: [] };
    mockEmptyDraft = VALID_DRAFT;
    // VALID_DRAFT seeds a dirty, never-saved draft, so applyAiRecipe prompts the
    // dirty-overwrite confirm; accept it so the changed path proceeds.
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  async function driveEditForm(message = "tweak the form") {
    await userEvent.type(
      screen.getByPlaceholderText(/make the email field required/i),
      message,
    );
    await userEvent.click(screen.getByRole("button", { name: /edit form/i }));
  }

  it("loads a contract-invalid recipe and lights up the validation panel", async () => {
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "Here you go." });
    validateRecipe.mockResolvedValue({
      ok: false,
      issues: [
        { path: "steps[0].fields", message: "Each step needs at least one field." },
      ],
    });
    renderBuilder();

    await driveEditForm();

    // The draft loaded (form title input now reflects the AI recipe)...
    expect(await screen.findByDisplayValue("Edited Form")).toBeInTheDocument();
    // ...the contract issue shows in the validation panel...
    expect(
      await screen.findByText(/each step needs at least one field/i),
    ).toBeInTheDocument();
    // ...the sidebar confirms it was applied, not rejected...
    expect(
      await screen.findByText(/applied to the editor/i),
    ).toBeInTheDocument();
    // ...and there is no red error banner (warning, not rejection).
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 30_000);

  it("loads a recipe with an id collision and warns instead of rejecting", async () => {
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "Here you go." });
    validateRecipe.mockResolvedValue({ ok: true });
    mockCollisions = {
      fieldIdCollisions: [
        {
          id: "email",
          locations: [
            {
              fieldId: "email",
              editorFieldId: "a",
              stepId: "step-1",
              stepTitle: "Step 1",
              display: "Email",
              isBoolean: false,
              isNumeric: false,
            },
            {
              fieldId: "email",
              editorFieldId: "b",
              stepId: "step-1",
              stepTitle: "Step 1",
              display: "Email (2)",
              isBoolean: false,
              isNumeric: false,
            },
          ],
        },
      ],
      stepIdCollisions: [],
    };
    renderBuilder();

    await driveEditForm();

    expect(await screen.findByDisplayValue("Edited Form")).toBeInTheDocument();
    // The collision is surfaced by the always-on collision panel...
    expect(
      await screen.findByText(/Duplicate IDs must be fixed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/is used by 2 fields/i)).toBeInTheDocument();
    // ...and the sidebar confirms it was applied, not rejected.
    expect(
      await screen.findByText(/applied to the editor/i),
    ).toBeInTheDocument();
  }, 30_000);

  it("still loads with a warning when convert flags unresolvable refs", async () => {
    editRecipe.mockResolvedValue({
      recipe: EDITED_RECIPE,
      reply: "Built it.",
      unresolvableRefs: [
        { ref: "components/made-up", path: "steps[0].elements[0].ref" },
      ],
    });
    renderBuilder();

    await driveEditForm();

    expect(await screen.findByDisplayValue("Edited Form")).toBeInTheDocument();
    expect(
      await screen.findByText(/Unknown component\/block ref "components\/made-up"/),
    ).toBeInTheDocument();
    // The contract validate is skipped when refs are already flagged.
    expect(validateRecipe).not.toHaveBeenCalled();
  }, 30_000);

  it("hard-errors and does not load a structurally unreadable recipe", async () => {
    // No `steps` array → deserializeRecipe throws → buildLoadArgs throws.
    editRecipe.mockResolvedValue({
      recipe: { formId: "broken", title: "Broken", version: "1.0.1" },
      reply: "Here you go.",
    });
    renderBuilder();

    await driveEditForm();

    // The red error banner shows...
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // ...and nothing loaded (no apply status, draft untouched).
    expect(screen.queryByText(/applied to the editor/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Broken")).not.toBeInTheDocument();
  }, 30_000);

  it("hard-errors when the validate request itself fails", async () => {
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "Here you go." });
    validateRecipe.mockRejectedValue(new Error("Validation service unavailable"));
    renderBuilder();

    await driveEditForm();

    expect(
      await screen.findByText("Validation service unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/applied to the editor/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Edited Form")).not.toBeInTheDocument();
  }, 30_000);

  it("reports 'unchanged' without validating when the recipe matches the draft", async () => {
    mockEmptyDraft = EDITED_DRAFT;
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "No change needed." });
    renderBuilder();

    await driveEditForm();

    expect(
      await screen.findByText(/returned the form unchanged/i),
    ).toBeInTheDocument();
    // No-op guard fires before the validate gate.
    expect(validateRecipe).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  }, 30_000);

  it("stays silent and does not load when the dirty-overwrite confirm is declined", async () => {
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "Here you go." });
    validateRecipe.mockResolvedValue({ ok: true });
    confirmSpy.mockReturnValue(false);
    renderBuilder();

    await driveEditForm();

    // The assistant prose lands, but no apply status, no error, no load.
    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(screen.queryByText(/applied to the editor/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Edited Form")).not.toBeInTheDocument();
  }, 30_000);

  it("keeps Deploy blocked after a load-with-warning", async () => {
    editRecipe.mockResolvedValue({ recipe: EDITED_RECIPE, reply: "Here you go." });
    validateRecipe.mockResolvedValue({
      ok: false,
      issues: [
        { path: "steps[0].fields", message: "Each step needs at least one field." },
      ],
    });
    renderBuilder();

    await driveEditForm();
    await screen.findByText(/each step needs at least one field/i);

    // The loaded-but-invalid draft is unsaved, so Deploy stays disabled
    // (#331 unsaved gate / #504 hard deploy gate).
    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  }, 30_000);
});
