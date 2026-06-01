import { buildLoadArgs, draftsEqual } from "./-apply-recipe";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

// ── buildLoadArgs ────────────────────────────────────────────────────────────
// Turns a recipe into the (draft, version) the editor's load path needs. The
// version must come from the recipe itself — a recipe returned by the AI
// assistant has no form summary to read a version from.

describe("buildLoadArgs", () => {
  const catalog = {
    components: [],
    blocks: [],
    custom: [],
  } as unknown as RegistryCatalog;
  const recipe = {
    formId: "passport-renewal",
    title: "Passport Renewal",
    steps: [],
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    version: "2.3.0",
  } as unknown as ServiceContractRecipe;

  it("takes the version from the recipe", () => {
    const draft = { steps: [] } as unknown as RecipeDraft;
    const { version } = buildLoadArgs(recipe, catalog, () => draft);
    expect(version).toBe("2.3.0");
  });

  it("deserializes the recipe with the given catalog", () => {
    const draft = { steps: [] } as unknown as RecipeDraft;
    const deserialize = jest.fn(() => draft);
    const result = buildLoadArgs(recipe, catalog, deserialize);
    expect(deserialize).toHaveBeenCalledWith(recipe, catalog);
    expect(result.draft).toBe(draft);
  });
});

// ── draftsEqual ──────────────────────────────────────────────────────────────
// The no-op guard for the AI sidebar: an unchanged recipe must not bump the
// patch version. Equality ignores version, the serialize-stamped timestamps,
// and the editor-only field ids.

type Field = RecipeDraft["steps"][number]["fields"][number];

describe("draftsEqual", () => {
  const draft = (fields: Field[]): RecipeDraft => ({
    formId: "contact",
    title: "Contact",
    steps: [{ stepId: "step-1", title: "Step 1", fields, behaviours: [] }],
  });

  const field = (id: string, ref: string): Field =>
    ({ id, kind: "component", ref, overrides: {} }) as Field;

  it("treats two structurally identical drafts as equal despite differing field ids", () => {
    const a = draft([field("id-aaa", "components/email")]);
    const b = draft([field("id-bbb", "components/email")]);
    expect(draftsEqual(a, b)).toBe(true);
  });

  it("treats a changed field ref as not equal", () => {
    const a = draft([field("id-aaa", "components/email")]);
    const b = draft([field("id-aaa", "components/phone")]);
    expect(draftsEqual(a, b)).toBe(false);
  });

  it("treats a changed field override as not equal", () => {
    const a = draft([field("id-aaa", "components/email")]);
    const withReq = {
      ...field("id-aaa", "components/email"),
      overrides: { required: true },
    } as Field;
    const b = draft([withReq]);
    expect(draftsEqual(a, b)).toBe(false);
  });
});
