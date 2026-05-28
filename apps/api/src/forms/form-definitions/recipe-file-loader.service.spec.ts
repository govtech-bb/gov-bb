import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { Logger } from "@nestjs/common";
import {
  RecipeFileLoaderService,
  isLeafName,
} from "./recipe-file-loader.service";

const FIXTURES_ROOT = path.join(__dirname, "__fixtures__");

/**
 * Build a temporary recipes-root tree of the shape
 *   recipes/{formId}/{version}.json
 * by copying named fixtures into it. Returns the root path; the caller
 * is responsible for cleaning it up.
 */
async function buildTempRecipesRoot(
  layout: Record<string, string[]>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
  for (const [formId, fixtureNames] of Object.entries(layout)) {
    const dir = path.join(root, formId);
    await fs.mkdir(dir, { recursive: true });
    for (const name of fixtureNames) {
      const src = path.join(FIXTURES_ROOT, name);
      const contents = JSON.parse(await fs.readFile(src, "utf8"));
      const dest = path.join(dir, `${contents.version}.json`);
      await fs.writeFile(dest, JSON.stringify(contents, null, 2) + "\n");
    }
  }
  return root;
}

describe("RecipeFileLoaderService", () => {
  let tempRoots: string[];
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    tempRoots = [];
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    for (const r of tempRoots) {
      await fs.rm(r, { recursive: true, force: true });
    }
  });

  async function newRoot(layout: Record<string, string[]>): Promise<string> {
    const r = await buildTempRecipesRoot(layout);
    tempRoots.push(r);
    return r;
  }

  describe("loadAll", () => {
    it("loads a single valid recipe", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json"],
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ]);
    });

    it("loads multiple forms and lists them via findAll", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json"],
        "drivers-licence": ["other-form.json"],
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      const all = loader.findAll();
      expect(all).toHaveLength(2);
      expect(all).toEqual(
        expect.arrayContaining([
          {
            formId: "passport-renewal",
            title: "Passport Renewal",
            version: "1.0.0",
          },
          {
            formId: "drivers-licence",
            title: "Drivers Licence",
            version: "1.0.0",
          },
        ]),
      );
    });

    it("uses the latest version when a form has multiple versions", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json", "valid-recipe-v2.json"],
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.1.0",
        },
      ]);
    });

    it("skips a recipe that fails zod validation and logs the cause", async () => {
      const root = await newRoot({
        "broken-form": ["invalid-recipe.json"],
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/broken-form/);
    });

    it("skips a recipe when filename version does not match recipe.version and logs the cause", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      const formDir = path.join(root, "passport-renewal");
      await fs.mkdir(formDir);
      const recipe = JSON.parse(
        await fs.readFile(
          path.join(FIXTURES_ROOT, "valid-recipe.json"),
          "utf8",
        ),
      );
      await fs.writeFile(
        path.join(formDir, "9.9.9.json"),
        JSON.stringify(recipe),
      );

      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/9\.9\.9\.json/);
      expect(logged).toMatch(/passport-renewal/);
    });

    it("skips a recipe when directory name does not match recipe.formId and logs the cause", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      const formDir = path.join(root, "wrong-directory-name");
      await fs.mkdir(formDir);
      const recipe = JSON.parse(
        await fs.readFile(
          path.join(FIXTURES_ROOT, "valid-recipe.json"),
          "utf8",
        ),
      );
      await fs.writeFile(
        path.join(formDir, `${recipe.version}.json`),
        JSON.stringify(recipe),
      );

      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/wrong-directory-name/);
    });

    it("loads the good recipe and skips the bad one when both are present", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json"],
        "broken-form": ["invalid-recipe.json"],
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/broken-form/);
    });

    it("treats an empty recipes root as no forms", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
    });
  });

  describe("default recipesRoot", () => {
    it("resolves the default recipes root relative to the compiled module (not process.cwd)", () => {
      // No-arg construction → falls back to DEFAULT_RECIPES_ROOT, which the
      // service resolves via `path.resolve(__dirname, "recipes")`. In the
      // source tree that's apps/api/src/forms/form-definitions/recipes;
      // in the Docker prod build it resolves to
      // /app/dist/src/forms/form-definitions/recipes. Either way it must
      // sit beside the service file, so we anchor the assertion on the
      // service's own __dirname rather than on process.cwd().
      const loader = new RecipeFileLoaderService();
      const expected = path.resolve(__dirname, "recipes");

      // `recipesRoot` is private — reach into it for the assertion.
      const actual = (loader as unknown as { recipesRoot: string }).recipesRoot;

      expect(actual).toBe(expected);
      // Defensive: not derived from process.cwd() (the old behavior).
      expect(actual).not.toBe(path.resolve(process.cwd(), "recipes"));
    });
  });

  describe("findByFormId", () => {
    it("returns the latest version when no version is given", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json", "valid-recipe-v2.json"],
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      const recipe = loader.findByFormId({ formId: "passport-renewal" });

      expect(recipe?.version).toBe("1.1.0");
    });

    it("returns a specific version when version is given", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json", "valid-recipe-v2.json"],
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      const recipe = loader.findByFormId({
        formId: "passport-renewal",
        version: "1.0.0",
      });

      expect(recipe?.version).toBe("1.0.0");
    });

    it("returns null for an unknown formId", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json"],
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findByFormId({ formId: "ghost" })).toBeNull();
    });

    it("returns null for an unknown version", async () => {
      const root = await newRoot({
        "passport-renewal": ["valid-recipe.json"],
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(
        loader.findByFormId({ formId: "passport-renewal", version: "9.9.9" }),
      ).toBeNull();
    });
  });

  // CWE-22 defense-in-depth. `fs.readdir` already returns leaf names, but the
  // loader pipes every entry through `isLeafName` before constructing a path,
  // so any future input source that reaches the same code path (an env-
  // configured root, an operator-editable manifest, etc.) cannot smuggle
  // traversal segments through `path.join`. This unit-tests the guard
  // directly; integration follows by the loader applying it on every entry.
  describe("isLeafName", () => {
    it.each<[string, boolean]>([
      ["passport-renewal", true],
      ["1.0.0.json", true],
      ["weird but legal name", true],
      ["", false],
      [".", false],
      ["..", false],
      ["../escape", false],
      ["../etc/passwd", false],
      ["foo/bar", false],
      ["/abs/path", false],
      ["nested/sub", false],
    ])("isLeafName(%j) === %j", (name, expected) => {
      expect(isLeafName(name)).toBe(expected);
    });
  });
});
