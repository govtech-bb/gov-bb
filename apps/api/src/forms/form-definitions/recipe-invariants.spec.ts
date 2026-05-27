import * as fs from "node:fs/promises";
import * as path from "node:path";
import { serviceContractRecipeSchema } from "@govtech-bb/form-types";

// Guards the invariants RecipeFileLoaderService enforces at boot
// (onModuleInit -> loadAll). A violation throws there and aborts NestJS
// bootstrap, which on ECS means the task never goes healthy and the deploy
// is rolled back by the circuit breaker. The CI build/test gate does NOT
// boot the API, so without this test a bad recipe ships undetected. See #222.
const RECIPES_ROOT = path.resolve(__dirname, "recipes");

it("every recipe's formId matches its directory and filename matches its version", async () => {
  const problems: string[] = [];

  const formDirs = (await fs.readdir(RECIPES_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const formId of formDirs) {
    const dir = path.join(RECIPES_ROOT, formId);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const parsed = serviceContractRecipeSchema.parse(
        JSON.parse(await fs.readFile(path.join(dir, file), "utf8")),
      );
      if (parsed.formId !== formId) {
        problems.push(`${formId}/${file}: formId "${parsed.formId}" != dir`);
      }
      const filenameVersion = file.replace(/\.json$/, "");
      if (filenameVersion !== parsed.version) {
        problems.push(
          `${formId}/${file}: filename "${filenameVersion}" != version "${parsed.version}"`,
        );
      }
    }
  }

  expect(problems).toEqual([]);
});
