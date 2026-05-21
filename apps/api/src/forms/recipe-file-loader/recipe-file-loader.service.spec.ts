import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import {
  RecipeFileLoader,
  compareVersions,
} from "./recipe-file-loader.service";

function makeRecipe(
  overrides: Partial<ServiceContractRecipe> = {},
): ServiceContractRecipe {
  return {
    formId: "passport-renewal",
    title: "Passport Renewal",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [],
    ...overrides,
  } as ServiceContractRecipe;
}

async function writeRecipe(
  dir: string,
  recipe: ServiceContractRecipe,
): Promise<void> {
  const formDir = path.join(dir, recipe.formId);
  await fs.mkdir(formDir, { recursive: true });
  await fs.writeFile(
    path.join(formDir, `${recipe.version}.json`),
    JSON.stringify(recipe, null, 2),
    "utf8",
  );
}

describe("compareVersions", () => {
  it("orders by dot-separated integer segments", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.5")).toBeGreaterThan(0);
  });
});

describe("RecipeFileLoader", () => {
  let dir: string;
  let loader: RecipeFileLoader;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "recipe-loader-"));
    loader = new RecipeFileLoader();
  });

  afterEach(async () => {
    loader.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads a single valid recipe", async () => {
    const recipe = makeRecipe();
    await writeRecipe(dir, recipe);

    await loader.loadAll(dir);

    expect(loader.findLatest("passport-renewal")).toEqual(recipe);
    expect(loader.findVersion("passport-renewal", "1.0.0")).toEqual(recipe);
    expect(loader.listFormIds()).toEqual(["passport-renewal"]);
  });

  it("returns null for unknown forms and versions", async () => {
    await loader.loadAll(dir);

    expect(loader.findLatest("ghost")).toBeNull();
    expect(loader.findVersion("ghost", "1.0.0")).toBeNull();
  });

  it("treats a missing recipes directory as empty rather than fatal", async () => {
    const missing = path.join(dir, "does-not-exist");

    await expect(loader.loadAll(missing)).resolves.toBeUndefined();
    expect(loader.listFormIds()).toEqual([]);
  });

  it("skips malformed JSON without failing the boot", async () => {
    await fs.mkdir(path.join(dir, "broken"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "broken", "1.0.0.json"),
      "{not json",
      "utf8",
    );
    const ok = makeRecipe({ formId: "ok" });
    await writeRecipe(dir, ok);

    await loader.loadAll(dir);

    expect(loader.findLatest("broken")).toBeNull();
    expect(loader.findLatest("ok")).toEqual(ok);
  });

  it("skips recipes that fail Zod validation", async () => {
    await fs.mkdir(path.join(dir, "bad-shape"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "bad-shape", "1.0.0.json"),
      JSON.stringify({ formId: "bad-shape", version: "1.0.0" }),
      "utf8",
    );
    const ok = makeRecipe({ formId: "ok" });
    await writeRecipe(dir, ok);

    await loader.loadAll(dir);

    expect(loader.findLatest("bad-shape")).toBeNull();
    expect(loader.findLatest("ok")).toEqual(ok);
  });

  it("skips recipes whose filename does not match the version field", async () => {
    const recipe = makeRecipe({ formId: "drift", version: "1.0.0" });
    const formDir = path.join(dir, "drift");
    await fs.mkdir(formDir, { recursive: true });
    await fs.writeFile(
      path.join(formDir, "2.0.0.json"),
      JSON.stringify(recipe),
      "utf8",
    );

    await loader.loadAll(dir);

    expect(loader.findLatest("drift")).toBeNull();
  });

  it("skips recipes whose parent directory does not match the formId", async () => {
    const recipe = makeRecipe({ formId: "real-id", version: "1.0.0" });
    const wrongDir = path.join(dir, "wrong-dir");
    await fs.mkdir(wrongDir, { recursive: true });
    await fs.writeFile(
      path.join(wrongDir, "1.0.0.json"),
      JSON.stringify(recipe),
      "utf8",
    );

    await loader.loadAll(dir);

    expect(loader.findLatest("real-id")).toBeNull();
    expect(loader.findLatest("wrong-dir")).toBeNull();
  });

  it("selects the highest version as latest across multiple files", async () => {
    const v1 = makeRecipe({ version: "1.0.0", title: "v1" });
    const v2 = makeRecipe({ version: "1.2.0", title: "v1.2" });
    const v10 = makeRecipe({ version: "1.10.0", title: "v1.10" });
    await writeRecipe(dir, v1);
    await writeRecipe(dir, v2);
    await writeRecipe(dir, v10);

    await loader.loadAll(dir);

    expect(loader.findLatest("passport-renewal")).toEqual(v10);
    expect(loader.findVersion("passport-renewal", "1.0.0")).toEqual(v1);
    expect(loader.findVersion("passport-renewal", "1.2.0")).toEqual(v2);
    expect(loader.findVersion("passport-renewal", "1.10.0")).toEqual(v10);
  });

  it("ignores non-json files in form directories", async () => {
    const recipe = makeRecipe();
    await writeRecipe(dir, recipe);
    await fs.writeFile(
      path.join(dir, recipe.formId, "README.md"),
      "notes",
      "utf8",
    );

    await loader.loadAll(dir);

    expect(loader.findLatest(recipe.formId)).toEqual(recipe);
  });

  it("ignores files at the recipes root that are not directories", async () => {
    await fs.writeFile(path.join(dir, "stray.txt"), "hi", "utf8");
    const recipe = makeRecipe();
    await writeRecipe(dir, recipe);

    await loader.loadAll(dir);

    expect(loader.findLatest(recipe.formId)).toEqual(recipe);
  });

  it("replaces the in-memory map on reload, dropping removed forms", async () => {
    const a = makeRecipe({ formId: "a" });
    const b = makeRecipe({ formId: "b" });
    await writeRecipe(dir, a);
    await writeRecipe(dir, b);
    await loader.loadAll(dir);
    expect(loader.listFormIds().sort()).toEqual(["a", "b"]);

    await fs.rm(path.join(dir, "b"), { recursive: true, force: true });
    await loader.loadAll(dir);

    expect(loader.listFormIds()).toEqual(["a"]);
  });
});
