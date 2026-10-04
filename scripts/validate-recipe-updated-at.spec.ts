import {
  checkUpdatedAtBumped,
  isFlatRecipeFile,
} from "./validate-recipe-updated-at";

const RECIPES = "apps/api/src/forms/form-definitions/recipes";
const WHERE = `${RECIPES}/passport-renewal.json`;

const base = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  steps: [{ stepId: "your-details", title: "Your details", elements: [] }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

describe("checkUpdatedAtBumped", () => {
  it("passes a recipe file the base revision does not have", () => {
    expect(checkUpdatedAtBumped(null, json(base), WHERE)).toBeNull();
  });

  it("passes an unchanged file", () => {
    expect(checkUpdatedAtBumped(json(base), json(base), WHERE)).toBeNull();
  });

  it("passes a change that only moves updatedAt", () => {
    const after = { ...base, updatedAt: "2026-10-04T12:00:00.000Z" };
    expect(checkUpdatedAtBumped(json(base), json(after), WHERE)).toBeNull();
  });

  it("passes a formatting-only change — key order and whitespace are not content", () => {
    const reordered = JSON.stringify({
      updatedAt: base.updatedAt,
      steps: base.steps,
      title: base.title,
      createdAt: base.createdAt,
      formId: base.formId,
    });
    expect(checkUpdatedAtBumped(json(base), reordered, WHERE)).toBeNull();
  });

  it("passes a content change whose updatedAt moved forward", () => {
    const after = {
      ...base,
      title: "Renew a passport",
      updatedAt: "2026-10-04T12:00:00.000Z",
    };
    expect(checkUpdatedAtBumped(json(base), json(after), WHERE)).toBeNull();
  });

  it("fails a content change whose updatedAt did not move, naming the file and the stale stamp", () => {
    const after = { ...base, title: "Renew a passport" };
    const error = checkUpdatedAtBumped(json(base), json(after), WHERE);
    expect(error).toContain(WHERE);
    expect(error).toContain("updatedAt");
    expect(error).toContain("2026-05-22T00:00:00.000Z");
  });

  it("fails a content change whose updatedAt moved backwards", () => {
    // A revert pasted from an older copy: the content did change against the
    // base, and the builder needs a NEWER stamp for a draft row to re-sync.
    const after = {
      ...base,
      title: "Renew a passport",
      updatedAt: "2026-01-15T00:00:00.000Z",
    };
    const error = checkUpdatedAtBumped(json(base), json(after), WHERE);
    expect(error).toContain("moved back");
  });

  it("passes a content change that gives a recipe without updatedAt its first stamp", () => {
    const { updatedAt: _stamp, ...unstamped } = base;
    const after = { ...base, title: "Renew a passport" };
    expect(
      checkUpdatedAtBumped(json(unstamped), json(after), WHERE),
    ).toBeNull();
  });

  it("fails a content change that leaves the recipe without an updatedAt", () => {
    const { updatedAt: _stamp, ...after } = { ...base, title: "Renew" };
    const error = checkUpdatedAtBumped(json(base), json(after), WHERE);
    expect(error).toContain("missing");
  });

  it("fails a content change whose updatedAt is not a date", () => {
    const after = { ...base, title: "Renew", updatedAt: "last Tuesday" };
    const error = checkUpdatedAtBumped(json(base), json(after), WHERE);
    expect(error).toContain("not a date");
  });

  it("reports a file that is not valid JSON instead of throwing", () => {
    const error = checkUpdatedAtBumped(json(base), "{ not json", WHERE);
    expect(error).toContain("invalid JSON");
  });
});

describe("isFlatRecipeFile", () => {
  it("accepts only the canonical flat recipes/{formId}.json files", () => {
    expect(isFlatRecipeFile(`${RECIPES}/passport-renewal.json`)).toBe(true);
    // Legacy versioned fallback files are frozen — never checked.
    expect(isFlatRecipeFile(`${RECIPES}/passport-renewal/1.2.0.json`)).toBe(
      false,
    );
    expect(isFlatRecipeFile(`${RECIPES}/.gitkeep`)).toBe(false);
    expect(isFlatRecipeFile("services/passport-renewal.json")).toBe(false);
  });
});
