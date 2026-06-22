import { describe, it, expect } from "vitest";
import { extractRecipe } from "./recipe-extractor.js";

describe("extractRecipe", () => {
  it("parses a recipe from a fenced JSON block", () => {
    const recipe = extractRecipe(
      'Sure:\n```json\n{"formId":"f","steps":[]}\n```',
    );
    expect(recipe).toEqual({ formId: "f", steps: [] });
  });

  it("falls back to a raw JSON object when there is no fenced block", () => {
    const recipe = extractRecipe('Here it is: {"formId":"f","steps":[]} done');
    expect(recipe).toEqual({ formId: "f", steps: [] });
  });

  it("returns null when the fenced block lacks formId/steps", () => {
    expect(extractRecipe('```json\n{"title":"T"}\n```')).toBeNull();
  });

  it("returns null for invalid JSON in a fenced block", () => {
    expect(extractRecipe("```json\nnot json\n```")).toBeNull();
  });

  it("returns null when there is no JSON at all", () => {
    expect(extractRecipe("plain prose, no code block")).toBeNull();
  });
});
