/**
 * @vitest-environment node
 */
import { getCatalog } from "@govtech-bb/form-builder";

// Bare vi.fn's delegated to lazily, so the hoisted vi.mock factories are fine
// (same pattern as use-recipe-save.spec.tsx).
const getServiceOwner = vi.fn();
const getServiceDraft = vi.fn();
vi.mock("../../lib/service-drafts", () => ({
  getServiceOwner: (...args: unknown[]) => getServiceOwner(...args),
  getServiceDraft: (...args: unknown[]) => getServiceDraft(...args),
}));
const getRecipe = vi.fn();
const getFormConfig = vi.fn();
vi.mock("../../server/forms", () => ({
  getRecipe: (...args: unknown[]) => getRecipe(...args),
  getFormConfig: (...args: unknown[]) => getFormConfig(...args),
}));
const getFormSourceSha = vi.fn();
vi.mock("../../server/services", () => ({
  getFormSourceSha: (...args: unknown[]) => getFormSourceSha(...args),
}));

import { loadFormWorkspace } from "./load-form-draft";

const FORM_ID = "passport-renewal";
const RECIPE = {
  formId: FORM_ID,
  title: "Passport Renewal",
  steps: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};
const SHA = "3f786850e387550fdab836ed7e6dc881de23001b";

beforeEach(() => {
  vi.resetAllMocks();
  getServiceOwner.mockResolvedValue({ serviceId: null });
  getRecipe.mockResolvedValue(RECIPE);
  getFormConfig.mockResolvedValue({ mdaContactId: null, processors: null });
});

// #2489: Deploy refuses a stale base by comparing the committed recipe's blob
// sha with the one the builder saw at load — so the load must capture it,
// bound to the draft it returns.
describe("loadFormWorkspace — committed source sha (#2489)", () => {
  it("captures the committed recipe's blob sha alongside the draft", async () => {
    getFormSourceSha.mockResolvedValue(SHA);

    const result = await loadFormWorkspace(FORM_ID, getCatalog());

    expect(getFormSourceSha).toHaveBeenCalledWith({
      data: { formId: FORM_ID },
    });
    expect(result.sourceSha).toBe(SHA);
    expect(result.draft.formId).toBe(FORM_ID);
  });

  it("records null when no committed copy exists (first publish)", async () => {
    getFormSourceSha.mockResolvedValue(null);

    const result = await loadFormWorkspace(FORM_ID, getCatalog());

    expect(result.sourceSha).toBeNull();
  });

  it("still opens the form when the sha cannot be read, recording null", async () => {
    // null is the safe direction: Deploy verifies it against the live sha and
    // refuses when a committed copy turns out to exist, so a failed read costs
    // one reload prompt — it never blocks opening and never allows an
    // unchecked overwrite.
    getFormSourceSha.mockRejectedValue(new Error("GitHub unavailable"));

    const result = await loadFormWorkspace(FORM_ID, getCatalog());

    expect(result.draft.formId).toBe(FORM_ID);
    expect(result.sourceSha).toBeNull();
  });

  it("does not read the sha for a service-owned form, which deploys through the services workspace", async () => {
    getServiceOwner.mockResolvedValue({ serviceId: "passport-service" });
    getServiceDraft.mockResolvedValue({
      manifest: { serviceId: "passport-service", formId: FORM_ID },
      recipe: RECIPE,
      pendingConfig: { mdaContactId: null, processors: null },
      updatedAt: "2026-05-22T00:00:00.000Z",
    });

    const result = await loadFormWorkspace(FORM_ID, getCatalog());

    expect(getFormSourceSha).not.toHaveBeenCalled();
    expect(result.sourceSha).toBeNull();
    expect(result.serviceDraft).not.toBeNull();
  });
});
