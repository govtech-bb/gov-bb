import {
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
  serviceContractRecipeSchema,
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
  // formId → recipe, built from the flat `recipes/{formId}.json` files. Recipe
  // versioning was removed (#1196): there is one canonical file per form and no
  // legacy versioned fallback (the Phase 2 decommission deleted it).
  private recipes = new Map<string, ServiceContractRecipe>();

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
    const next = new Map<string, ServiceContractRecipe>();

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(this.recipesRoot, { withFileTypes: true });
    } catch (err) {
      // Missing root: treat as no recipes. Other errors propagate.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.recipes = next;
        return;
      }
      throw err;
    }

    const flatFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name);

    // Each form is a flat `recipes/{formId}.json` file, keyed by the recipe's
    // own formId. The filename (minus .json) must equal formId.
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
        next.set(recipe.formId, recipe);
      } catch (err) {
        const e = err as Error;
        this.logger.error(
          `Failed to load recipe ${filePath}: ${e.name}: ${e.message}`,
        );
      }
    }

    this.recipes = next;
    this.logger.log(`Loaded ${next.size} forms from ${this.recipesRoot}`);
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
    for (const [formId, recipe] of this.recipes) {
      out.push({
        formId,
        title: recipe.title,
        // #1196: version is retired; the list keeps the field as a frozen ""
        // breadcrumb so the public list contract is unchanged.
        version: recipe.version ?? "",
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

  findByFormId({ formId }: { formId: string }): ServiceContractRecipe | null {
    return this.recipes.get(formId) ?? null;
  }
}
