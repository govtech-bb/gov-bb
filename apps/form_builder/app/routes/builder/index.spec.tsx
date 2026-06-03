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
// real RPC.
const validateRecipe = jest.fn();
jest.mock("../../server/registry", () => ({
  getCatalogFn: jest.fn(),
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
  previewRecipe: jest.fn(),
}));
const getRecipe = jest.fn();
jest.mock("../../server/forms", () => ({
  submitRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  deleteForm: jest.fn(),
  disableForm: jest.fn(),
  enableForm: jest.fn(),
  getRecipe: (...args: unknown[]) => getRecipe(...args),
}));
jest.mock("../../server/publish", () => ({
  publishRecipe: jest.fn(),
  getPublishBaseBranch: jest.fn(),
}));
// The AI sidebar's convert server-fn is another createServerFn; stub it so
// importing the editor doesn't pull a real RPC at module-eval.
jest.mock("../../server/ai-builder/convert", () => ({
  convertRecipe: jest.fn(),
  getAiStatus: jest.fn(),
}));

// The Open picker's forms list is a slow GitHub-API waterfall; stub it out.
// `mockForms` is swappable per test so we can drive the uniqueness pre-flight.
let mockForms: { id: string; formId: string; title: string; version: string; isPublished: boolean }[] = [];
jest.mock("./-use-forms-list", () => ({
  useFormsList: () => ({ forms: mockForms, loadError: null, refetch: jest.fn() }),
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
jest.mock("@govtech-bb/form-builder", () => {
  const actual = jest.requireActual("@govtech-bb/form-builder");
  return {
    ...actual,
    findRecipeIdCollisions: () => ({
      fieldIdCollisions: [],
      stepIdCollisions: [],
    }),
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
