/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { createElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
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
jest.mock("../../../server/registry", () => ({
  getCatalogFn: jest.fn(),
  validateRecipe: (...args: unknown[]) => validateRecipe(...args),
  previewRecipe: jest.fn(),
}));
jest.mock("../../../server/forms", () => ({
  submitRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  deleteForm: jest.fn(),
  getRecipe: jest.fn(),
}));
jest.mock("../../../server/publish", () => ({
  publishRecipe: jest.fn(),
  getPublishBaseBranch: jest.fn(),
}));

// The Open picker's forms list is a slow GitHub-API waterfall; stub it out.
jest.mock("./-use-forms-list", () => ({
  useFormsList: () => ({ forms: [], loadError: null, refetch: jest.fn() }),
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
// populated registry catalog — the new behaviour under test is "click ⇒
// validate ⇒ open modal", not id-resolution.
jest.mock("@govtech-bb/form-builder", () => {
  const actual = jest.requireActual("@govtech-bb/form-builder");
  return {
    ...actual,
    findRecipeIdCollisions: () => ({
      fieldIdCollisions: [],
      stepIdCollisions: [],
    }),
    serializeRecipeDraft: () => ({ formId: "test-form", version: "1.0.0" }),
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

// One editable step carrying a field, so every pre-flight check passes and the
// (stubbed) server validate decides the outcome.
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
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it(
    "surfaces errors and leaves the SubmitModal closed when the draft is invalid and the user cancels the confirm",
    async () => {
      mockEmptyDraft = INVALID_DRAFT;
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
    15_000,
  );

  it(
    "opens the SubmitModal when the draft is invalid but the user confirms the save-anyway prompt",
    async () => {
      mockEmptyDraft = INVALID_DRAFT;
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
    15_000,
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
});
