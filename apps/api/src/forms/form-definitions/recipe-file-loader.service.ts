import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import * as fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import {
  SEMVER_PATTERN,
  serviceContractRecipeSchema,
  compareSemver,
  getRecipeVisibility,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";

// Resolved relative to this file so the loader works in both the source tree
// (dev: apps/api/src/forms/form-definitions/recipes/) and the compiled tree
// (prod: /app/dist/src/forms/form-definitions/recipes/, once the Dockerfile
// copies the .json recipes alongside the compiled .js — tsc doesn't bundle
// non-`.ts` assets).
const DEFAULT_RECIPES_ROOT = path.resolve(__dirname, "recipes");

/**
 * CWE-22 guard. `fs.readdir` already returns leaf names on POSIX, but every
 * directory or file entry the loader consumes is run through this before
 * being fed to `path.join`, so a future input source (env-configured root,
 * operator-editable manifest, etc.) reaching the same code path cannot
 * smuggle traversal segments. Exported for direct unit-testing.
 */
export function isLeafName(name: string): boolean {
  if (name === "" || name === "." || name === "..") return false;
  return path.basename(name) === name;
}

// Debounce window for coalescing the burst of fs events a single recipe
// edit produces (the nx asset watcher re-copies the file, which fires
// multiple change events) into one reload.
const WATCH_DEBOUNCE_MS = 250;

@Injectable()
export class RecipeFileLoaderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecipeFileLoaderService.name);
  private readonly recipesRoot: string;
  // Legacy fallback (#1196): formId → version → recipe, built from versioned
  // `recipes/{formId}/{v}.json` dirs. Retained read-only through Phase 1 so an
  // in-flight submission/draft still carrying a pinned version resolves.
  private store = new Map<string, Map<string, ServiceContractRecipe>>();
  // Canonical (#1196): formId → recipe, built from flat `recipes/{formId}.json`
  // files. The primary store once the flat files are committed (PR B); empty
  // until then, so the loader serves the highest versioned recipe exactly as
  // before.
  private canonical = new Map<string, ServiceContractRecipe>();

  // Dev-only hot-reload watcher (see startWatching). Undefined outside
  // development or if the watch fails to attach.
  private watcher?: FSWatcher;
  private reloadTimer?: NodeJS.Timeout;

  // `@Optional()` tells NestJS DI to inject `undefined` when no provider is
  // registered for the string parameter. Tests bypass DI and pass a root
  // explicitly. Production resolves to DEFAULT_RECIPES_ROOT.
  constructor(@Optional() recipesRoot?: string) {
    this.recipesRoot = recipesRoot ?? DEFAULT_RECIPES_ROOT;
  }

  async onModuleInit(): Promise<void> {
    await this.loadAll();
    this.startWatching();
  }

  onModuleDestroy(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.watcher = undefined;
  }

  /**
   * In development, watch the recipes directory and re-run `loadAll()` when a
   * recipe file changes, so edits are picked up without restarting the API.
   *
   * `loadAll` reads from `recipesRoot`, which in `nx run api:dev` is the
   * compiled `dist/.../recipes` tree. With the nx daemon enabled (the local
   * default), `@nx/js:tsc`'s asset watcher re-copies edited `src` recipes into
   * that tree — this watcher then reloads them. The running process otherwise
   * only reads recipes once at boot, so without this you must restart the API
   * to see recipe changes.
   *
   * Gated to NODE_ENV=development (matching FormDefinitionsService's dev-only
   * escape hatches) so production never attaches a filesystem watcher.
   */
  private startWatching(): void {
    if (process.env.NODE_ENV !== "development") return;

    try {
      this.watcher = watch(
        this.recipesRoot,
        { recursive: true },
        (_event, filename) => {
          this.handleWatchEvent(typeof filename === "string" ? filename : null);
        },
      );
      this.logger.log(`Watching ${this.recipesRoot} for recipe changes`);
    } catch (err) {
      // A missing directory or platform without recursive watch support is
      // non-fatal — the loader still serves the recipes read at boot.
      this.logger.warn(
        `Could not watch recipes directory ${this.recipesRoot}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Filter watch events down to recipe files, then debounce a reload. Split
   * out from the watch callback so the filtering is unit-testable.
   */
  private handleWatchEvent(filename: string | null): void {
    if (filename && !filename.endsWith(".json")) return;
    this.scheduleReload();
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      this.loadAll().catch((err) =>
        this.logger.error(
          `Recipe hot-reload failed: ${(err as Error).message}`,
        ),
      );
    }, WATCH_DEBOUNCE_MS);
  }

  async loadAll(): Promise<void> {
    const next = new Map<string, Map<string, ServiceContractRecipe>>();
    const nextCanonical = new Map<string, ServiceContractRecipe>();

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(this.recipesRoot, { withFileTypes: true });
    } catch (err) {
      // Missing root: treat as no recipes. Other errors propagate.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.store = next;
        this.canonical = nextCanonical;
        return;
      }
      throw err;
    }

    const formDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const flatFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);

    // Flat canonical files: `recipes/{formId}.json`, keyed by the recipe's own
    // formId. The flat filename (minus .json) must equal formId — same
    // self-consistency guard the versioned branch applies.
    for (const file of flatFiles) {
      if (!isLeafName(file)) {
        this.logger.error(
          `Refusing recipe file entry "${file}" under ${this.recipesRoot} — not a leaf name`,
        );
        continue;
      }
      const filePath = path.join(this.recipesRoot, file);
      try {
        const recipe = await this.parseRecipeFile(filePath);
        const filenameFormId = file.replace(/\.json$/, "");
        if (recipe.formId !== filenameFormId) {
          throw new Error(
            `Recipe ${filePath}: filename "${filenameFormId}" does not match recipe.formId "${recipe.formId}"`,
          );
        }
        nextCanonical.set(recipe.formId, recipe);
      } catch (err) {
        const e = err as Error;
        this.logger.error(
          `Failed to load canonical recipe ${filePath}: ${e.name}: ${e.message}`,
        );
      }
    }

    for (const formId of formDirs) {
      if (!isLeafName(formId)) {
        this.logger.error(
          `Refusing recipes directory entry "${formId}" under ${this.recipesRoot} — not a leaf name`,
        );
        continue;
      }
      const dir = path.join(this.recipesRoot, formId);
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
      const byVersion = new Map<string, ServiceContractRecipe>();

      for (const file of files) {
        if (!isLeafName(file)) {
          this.logger.error(
            `Refusing recipe file entry "${file}" under ${dir} — not a leaf name`,
          );
          continue;
        }
        const filePath = path.join(dir, file);
        try {
          const recipe = await this.parseRecipeFile(filePath);

          // Versioned legacy files carry a version, and the filename, the
          // recipe.version and the dir name must all agree.
          if (!recipe.version) {
            throw new Error(
              `Recipe ${filePath}: versioned recipe is missing a version`,
            );
          }
          const filenameVersion = file.replace(/\.json$/, "");
          if (filenameVersion !== recipe.version) {
            throw new Error(
              `Recipe ${filePath}: filename version "${filenameVersion}" does not match recipe.version "${recipe.version}"`,
            );
          }
          if (recipe.formId !== formId) {
            throw new Error(
              `Recipe ${filePath}: directory name "${formId}" does not match recipe.formId "${recipe.formId}"`,
            );
          }

          byVersion.set(recipe.version, recipe);
        } catch (err) {
          const e = err as Error;
          this.logger.error(
            `Failed to load recipe ${filePath} (formId=${formId}): ${e.name}: ${e.message}`,
          );
        }
      }

      if (byVersion.size > 0) {
        next.set(formId, byVersion);
      }
    }

    this.store = next;
    this.canonical = nextCanonical;
    const versionedCount = Array.from(next.values()).reduce(
      (sum, m) => sum + m.size,
      0,
    );
    this.logger.log(
      `Loaded ${nextCanonical.size} canonical + ${next.size} versioned forms ` +
        `(${versionedCount} versioned files) from ${this.recipesRoot}`,
    );
  }

  /**
   * Read, JSON-parse and zod-validate a recipe file. Throws with a descriptive
   * message on any failure. Shared by the canonical (flat) and versioned
   * (dir) load paths.
   */
  private async parseRecipeFile(
    filePath: string,
  ): Promise<ServiceContractRecipe> {
    const raw = await fs.readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `Failed to parse recipe ${filePath}: ${(err as Error).message}`,
      );
    }
    const result = serviceContractRecipeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Recipe ${filePath} failed validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  findAll(): {
    formId: string;
    title: string;
    version: string;
    category?: string;
  }[] {
    const out: {
      formId: string;
      title: string;
      version: string;
      category?: string;
    }[] = [];
    // Union of canonical and versioned forms; the canonical recipe wins when a
    // form has both (the steady state during Phase 1). A canonical recipe has
    // no version, so the listed version falls back to the highest versioned
    // file's number when one exists, else "".
    const formIds = new Set([...this.canonical.keys(), ...this.store.keys()]);
    for (const formId of formIds) {
      const versions = this.store.get(formId);
      const latestVersioned = versions ? this.latestVersion(versions) : null;
      const recipe = this.canonical.get(formId) ?? latestVersioned;
      if (!recipe) continue;
      // Hide non-public forms from the list (#1646) — the list carries no
      // preview token, so preview/draft forms are unlisted for everyone,
      // matching the 404 their single-form GET returns to the public.
      if (getRecipeVisibility(recipe) !== "public") continue;
      out.push({
        formId,
        title: recipe.title,
        version: recipe.version ?? latestVersioned?.version ?? "",
        // Category is the contact-details title (e.g. the owning
        // ministry/department). Omitted when the recipe has no
        // contactDetails so the landing page can fall back to "Unknown".
        ...(recipe.contactDetails?.title && {
          category: recipe.contactDetails.title,
        }),
      });
    }
    return out;
  }

  findByFormId({
    formId,
    version,
  }: {
    formId: string;
    version?: string;
  }): ServiceContractRecipe | null {
    // A pinned version resolves the legacy versioned file first; if it has
    // aged out (Phase 2 deletes them), fall through to the canonical recipe —
    // but NOT to the latest versioned file, so an unknown version stays null
    // when no canonical recipe exists (unchanged pre-#1196 behaviour).
    if (version) {
      const legacy = this.loadLegacyVersion(formId, version);
      if (legacy) return legacy;
      return this.canonical.get(formId) ?? null;
    }
    const canonical = this.canonical.get(formId);
    if (canonical) return canonical;
    const versions = this.store.get(formId);
    return versions ? this.latestVersion(versions) : null;
  }

  /**
   * Resolve a specific legacy versioned recipe from `recipes/{formId}/{v}.json`.
   * The version is validated against SEMVER_PATTERN before lookup —
   * defence-in-depth, since a stored pin flows toward a file path on cold load.
   * Returns null when the form/version pair is not present.
   */
  loadLegacyVersion(
    formId: string,
    version: string,
  ): ServiceContractRecipe | null {
    if (!SEMVER_PATTERN.test(version)) {
      throw new BadRequestException(`Invalid recipe version: ${version}`);
    }
    return this.store.get(formId)?.get(version) ?? null;
  }

  private latestVersion(
    versions: Map<string, ServiceContractRecipe>,
  ): ServiceContractRecipe | null {
    let best: ServiceContractRecipe | null = null;
    let bestVersion = "";
    for (const [version, recipe] of versions) {
      if (!best || compareSemver(version, bestVersion) > 0) {
        best = recipe;
        bestVersion = version;
      }
    }
    return best;
  }
}
