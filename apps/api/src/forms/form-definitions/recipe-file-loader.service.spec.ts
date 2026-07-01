import type { MockInstance } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";

// node:fs exports are non-configurable (no vi.spyOn), and whether fs.watch
// throws on a missing dir varies by platform and node version — so route
// watch through a partial mock the unwatchable-dir test can override.
let mockWatchOverride: (() => never) | undefined;
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    watch: (...args: unknown[]) =>
      mockWatchOverride
        ? mockWatchOverride()
        : (actual.watch as (...a: unknown[]) => unknown)(...args),
  };
});
import { Logger } from "@nestjs/common";
import {
  RecipeFileLoaderService,
  isLeafName,
} from "./recipe-file-loader.service";

const FIXTURES_ROOT = path.join(__dirname, "__fixtures__");

/**
 * Build a temporary recipes-root tree of flat canonical files
 *   recipes/{formId}.json
 * by copying named fixtures into it. The recipe's `formId` is set to the
 * layout key and any `version` field is stripped, to mimic a real canonical
 * file (#1196: recipe versioning was removed — there is one flat file per
 * form and no versioned dirs). Returns the root path; the caller is
 * responsible for cleaning it up.
 */
async function buildTempRecipesRoot(
  layout: Record<string, string>,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
  for (const [formId, fixtureName] of Object.entries(layout)) {
    const src = path.join(FIXTURES_ROOT, fixtureName);
    const { version: _version, ...contents } = JSON.parse(
      await fs.readFile(src, "utf8"),
    );
    const recipe = { ...contents, formId };
    await fs.writeFile(
      path.join(root, `${formId}.json`),
      JSON.stringify(recipe, null, 2) + "\n",
    );
  }
  return root;
}

/**
 * Write a flat canonical recipe `recipes/{formId}.json` (#1196) into `root`,
 * based on the valid-recipe fixture, with `version` stripped to mimic a real
 * canonical file. `overrides` lets a test set a distinguishing field.
 */
async function writeFlatRecipe(
  root: string,
  formId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const base = JSON.parse(
    await fs.readFile(path.join(FIXTURES_ROOT, "valid-recipe.json"), "utf8"),
  );
  const { version: _version, ...withoutVersion } = base;
  const recipe = { ...withoutVersion, formId, ...overrides };
  await fs.writeFile(
    path.join(root, `${formId}.json`),
    JSON.stringify(recipe, null, 2) + "\n",
  );
}

/** Poll `predicate` until it returns true or `timeoutMs` elapses. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 25,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe("RecipeFileLoaderService", () => {
  let tempRoots: string[];
  let loaders: RecipeFileLoaderService[];
  let errorSpy: MockInstance;

  beforeEach(() => {
    tempRoots = [];
    loaders = [];
    errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    // Tear down any watchers started via onModuleInit so they don't leak
    // between tests.
    for (const l of loaders) l.onModuleDestroy();
    errorSpy.mockRestore();
    for (const r of tempRoots) {
      await fs.rm(r, { recursive: true, force: true });
    }
  });

  async function newRoot(layout: Record<string, string>): Promise<string> {
    const r = await buildTempRecipesRoot(layout);
    tempRoots.push(r);
    return r;
  }

  describe("loadAll", () => {
    it("loads a single valid recipe", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "",
        },
      ]);
    });

    it("loads multiple forms and lists them via findAll", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
        "drivers-licence": "other-form.json",
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
            version: "",
          },
          {
            formId: "drivers-licence",
            title: "Drivers Licence",
            version: "",
          },
        ]),
      );
    });

    it("surfaces contactDetails.title as the form category", async () => {
      const root = await newRoot({
        "passport-renewal": "recipe-with-contact.json",
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "",
          category: "Immigration Department",
        },
      ]);
    });

    it("omits category when the recipe has no contactDetails", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()[0]).not.toHaveProperty("category");
    });

    it("skips a recipe that fails zod validation and logs the cause", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      // Empty title fails the recipe schema (#1196: version is now optional,
      // so the invalid-recipe fixture is no longer the source of invalidity).
      await writeFlatRecipe(root, "broken-form", { title: "" });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/broken-form/);
    });

    it("loads the good recipe and skips the bad one when both are present", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      // Empty title fails the recipe schema (see the zod-validation test).
      await writeFlatRecipe(root, "broken-form", { title: "" });
      const loader = new RecipeFileLoaderService(root);

      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "",
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
    it("returns the recipe for a known formId", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      const recipe = loader.findByFormId({ formId: "passport-renewal" });

      expect(recipe?.formId).toBe("passport-renewal");
      expect(recipe?.title).toBe("Passport Renewal");
    });

    it("returns null for an unknown formId", async () => {
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findByFormId({ formId: "ghost" })).toBeNull();
    });
  });

  describe("findMaintenanceFormIds (#1694)", () => {
    it("returns only the IDs of maintenance recipes", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      await writeFlatRecipe(root, "public-form");
      await writeFlatRecipe(root, "preview-form", {
        meta: { visibility: "preview" },
      });
      await writeFlatRecipe(root, "maintenance-form", {
        meta: { visibility: "maintenance" },
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findMaintenanceFormIds()).toEqual(["maintenance-form"]);
    });

    it("excludes maintenance forms from the public findAll list", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      await writeFlatRecipe(root, "maintenance-form", {
        meta: { visibility: "maintenance" },
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
    });
  });

  // #1196: flat `recipes/{formId}.json` is the canonical (and only) store —
  // recipe versioning was removed, and the versioned `recipes/{formId}/{v}.json`
  // dirs were deleted entirely (no legacy fallback).
  describe("canonical flat recipes (#1196)", () => {
    it("lists a canonical form via findAll with an empty version", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      await writeFlatRecipe(root, "passport-renewal");
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findAll()).toEqual([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "", // canonical files carry no version
        },
      ]);
    });

    it("rejects a flat file whose name does not match its formId", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "recipes-test-"));
      tempRoots.push(root);
      // File named wrong-name.json but recipe.formId is passport-renewal.
      await writeFlatRecipe(root, "passport-renewal");
      await fs.rename(
        path.join(root, "passport-renewal.json"),
        path.join(root, "wrong-name.json"),
      );
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findAll()).toEqual([]);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/wrong-name/);
    });
  });

  describe("dev hot-reload watching", () => {
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    });

    function watcherOf(loader: RecipeFileLoaderService): unknown {
      return (loader as unknown as { watcher: unknown }).watcher;
    }

    it("starts a watcher and reloads when a recipe changes (development)", async () => {
      process.env.NODE_ENV = "development";
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);
      loaders.push(loader);

      await loader.onModuleInit();
      expect(watcherOf(loader)).toBeDefined();
      expect(
        loader.findByFormId({ formId: "passport-renewal" }),
      ).not.toBeNull();
      expect(loader.findByFormId({ formId: "drivers-licence" })).toBeNull();

      // Drop a new canonical recipe into the watched tree; the watcher should
      // pick it up and reload without another explicit loadAll() call.
      await writeFlatRecipe(root, "drivers-licence");

      await waitFor(
        () => loader.findByFormId({ formId: "drivers-licence" }) !== null,
      );
      expect(loader.findByFormId({ formId: "drivers-licence" })?.formId).toBe(
        "drivers-licence",
      );
    });

    it("does not start a watcher outside development", async () => {
      process.env.NODE_ENV = "test";
      const root = await newRoot({
        "passport-renewal": "valid-recipe.json",
      });
      const loader = new RecipeFileLoaderService(root);
      loaders.push(loader);

      await loader.onModuleInit();

      expect(watcherOf(loader)).toBeUndefined();
    });

    it("warns and does not throw when the recipes dir cannot be watched", async () => {
      process.env.NODE_ENV = "development";
      const warnSpy = vi
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => {});
      mockWatchOverride = () => {
        throw new Error("ENOENT: no such file or directory");
      };
      const loader = new RecipeFileLoaderService(
        path.join(os.tmpdir(), "recipes-does-not-exist-xyz"),
      );
      loaders.push(loader);

      try {
        await expect(loader.onModuleInit()).resolves.not.toThrow();
        expect(watcherOf(loader)).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        mockWatchOverride = undefined;
        warnSpy.mockRestore();
      }
    });

    it("onModuleDestroy is safe when no watcher was started", () => {
      const loader = new RecipeFileLoaderService("/unused");
      expect(() => loader.onModuleDestroy()).not.toThrow();
    });

    it("ignores non-.json change events", () => {
      const root = "/unused";
      const loader = new RecipeFileLoaderService(root);
      const scheduleSpy = vi.spyOn(
        loader as unknown as { scheduleReload: () => void },
        "scheduleReload",
      );

      const handle = (
        loader as unknown as {
          handleWatchEvent: (f: string | null) => void;
        }
      ).handleWatchEvent.bind(loader);

      handle("notes.txt");
      expect(scheduleSpy).not.toHaveBeenCalled();

      handle("passport-renewal.json");
      handle(null);
      expect(scheduleSpy).toHaveBeenCalledTimes(2);
    });
  });

  // CWE-22 defense-in-depth. `fs.readdir` already returns leaf names, but the
  // loader pipes every entry through `isLeafName` before constructing a path,
  // so any future input source that reaches the same code path (an env-
  // configured root, an operator-editable manifest, etc.) cannot smuggle
  // traversal segments through `path.join`. This unit-tests the guard
  // directly; integration follows by the loader applying it on every entry.
  describe("findAll visibility gate (#1646)", () => {
    it("omits non-public forms from the list, keeps public ones", async () => {
      const root = await newRoot({});
      await writeFlatRecipe(root, "public-form");
      await writeFlatRecipe(root, "preview-form", {
        meta: { visibility: "preview" },
      });
      await writeFlatRecipe(root, "draft-form", {
        meta: { visibility: "draft" },
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findAll().map((f) => f.formId)).toEqual(["public-form"]);
    });

    it("treats a recipe with no meta as preview (hidden from the list)", async () => {
      const root = await newRoot({});
      // `meta: undefined` overrides the helper's public default, so the written
      // file carries no `meta` at all — exercising the metaless default.
      await writeFlatRecipe(root, "legacy-form", { meta: undefined });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findAll().map((f) => f.formId)).not.toContain(
        "legacy-form",
      );
    });

    it("still resolves a non-public recipe via findByFormId (gate is applied by the service, not the loader)", async () => {
      const root = await newRoot({});
      await writeFlatRecipe(root, "preview-form", {
        meta: { visibility: "preview" },
      });
      const loader = new RecipeFileLoaderService(root);
      await loader.loadAll();

      expect(loader.findByFormId({ formId: "preview-form" })).not.toBeNull();
    });
  });

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
