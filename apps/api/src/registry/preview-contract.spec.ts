import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  serviceContractSchema,
} from "@govtech-bb/form-types";
import { hydrateRecipeForPreview } from "./preview-contract";

const RECIPES_ROOT = path.resolve(
  __dirname,
  "../forms/form-definitions/recipes",
);

async function recipeFiles(): Promise<string[]> {
  const entries = await fs.readdir(RECIPES_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);
}

describe("hydrateRecipeForPreview", () => {
  it("hydrates every real recipe to a schema-valid contract with processors stripped", async () => {
    const files = await recipeFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(
        await fs.readFile(path.join(RECIPES_ROOT, file), "utf8"),
      );
      const recipe = serviceContractRecipeSchema.parse(raw);
      const contract = await hydrateRecipeForPreview(recipe);
      expect(() => serviceContractSchema.parse(contract)).not.toThrow();
      expect(contract).not.toHaveProperty("processors");
    }
  });

  it("throws when a recipe references an unknown component", async () => {
    const files = await recipeFiles();
    const rawText = await fs.readFile(
      path.join(RECIPES_ROOT, files[0]),
      "utf8",
    );
    // Recipes contain `"ref": "components/..."` / `"blocks/..."` entries;
    // corrupt the first so hydration cannot resolve it.
    const corrupted = rawText.replace(
      /"ref":\s*"[^"]+"/,
      '"ref": "components/__does_not_exist__"',
    );
    expect(corrupted).not.toEqual(rawText); // guard: the recipe had a ref
    const recipe = serviceContractRecipeSchema.parse(JSON.parse(corrupted));
    await expect(hydrateRecipeForPreview(recipe)).rejects.toThrow();
  });
});
