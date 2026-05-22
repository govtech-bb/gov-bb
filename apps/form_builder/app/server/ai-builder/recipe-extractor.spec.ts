import { extractRecipe } from "./recipe-extractor";

describe("extractRecipe", () => {
  it("extracts recipe from ```json fenced block", () => {
    const text =
      "Here is the form:\n```json\n" +
      JSON.stringify({ formId: "x", steps: [{ stepId: "s1" }] }) +
      "\n```\nLet me know if you want changes.";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "x", steps: [{ stepId: "s1" }] });
  });

  it("extracts recipe from unfenced JSON in body", () => {
    const text =
      "prose " +
      JSON.stringify({ formId: "y", steps: [{ stepId: "s2" }] }) +
      " more prose";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "y", steps: [{ stepId: "s2" }] });
  });

  it("strips $recipe$ wrappers when AI emits SQL form", () => {
    const json = JSON.stringify({ formId: "z", steps: [{ stepId: "s3" }] });
    const text = "```\n$recipe$" + json + "$recipe$\n```";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "z", steps: [{ stepId: "s3" }] });
  });

  it("strips INSERT SQL wrapper around JSON", () => {
    const json = JSON.stringify({ formId: "q", steps: [] });
    const text =
      "```sql\nINSERT INTO form_definitions (schema) VALUES (" +
      json +
      ");\n```";
    const recipe = extractRecipe(text);
    expect(recipe).toEqual({ formId: "q", steps: [] });
  });

  it("returns null when no recipe JSON is present", () => {
    expect(extractRecipe("Just a plain message, no JSON here.")).toBeNull();
  });

  it("rejects JSON missing formId or steps", () => {
    expect(
      extractRecipe("```json\n" + JSON.stringify({ formId: "only" }) + "\n```"),
    ).toBeNull();
    expect(
      extractRecipe("```json\n" + JSON.stringify({ steps: [] }) + "\n```"),
    ).toBeNull();
  });
});
