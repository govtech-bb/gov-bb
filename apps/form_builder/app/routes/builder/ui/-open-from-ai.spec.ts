import { parseBuilderSearch, buildLoadArgs } from "./-open-from-ai";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";

// ── parseBuilderSearch ───────────────────────────────────────────────────────
// Validates the `?formId=` handoff param coming off the router. The AI page
// navigates here with a formId; everything else must be ignored so a stray or
// malformed param can't trigger a load.

describe("parseBuilderSearch", () => {
  it("keeps a non-empty formId string", () => {
    expect(parseBuilderSearch({ formId: "passport-renewal" })).toEqual({
      formId: "passport-renewal",
    });
  });

  it("drops an empty formId", () => {
    expect(parseBuilderSearch({ formId: "" })).toEqual({});
  });

  it("drops a missing formId", () => {
    expect(parseBuilderSearch({})).toEqual({});
  });

  it("ignores a non-string formId", () => {
    expect(parseBuilderSearch({ formId: 123 })).toEqual({});
  });
});

// ── buildLoadArgs ────────────────────────────────────────────────────────────
// Turns a stored recipe into the (draft, version) handleLoad needs. The version
// must come from the recipe itself — a form opened straight from AI has no form
// summary to read a version from.

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
