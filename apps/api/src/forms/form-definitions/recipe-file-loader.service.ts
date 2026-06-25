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
  // formId → version → recipe
  private store = new Map<string, Map<string, ServiceContractRecipe>>();

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

    let formDirs: string[];
    try {
      const entries = await fs.readdir(this.recipesRoot, {
        withFileTypes: true,
      });
      formDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (err) {
      // Missing root: treat as no recipes. Other errors propagate.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.store = next;
        return;
      }
      throw err;
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
              `Recipe ${filePath} (formId=${formId}) failed validation: ${result.error.message}`,
            );
          }
          const recipe = result.data;

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
    this.logger.log(
      `Loaded ${next.size} forms (${Array.from(next.values()).reduce(
        (sum, m) => sum + m.size,
        0,
      )} recipe files) from ${this.recipesRoot}`,
    );
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
    for (const [formId, versions] of this.store) {
      const latest = this.latestVersion(versions);
      // Hide non-public forms from the list (#1646) — the list carries no
      // preview token, so preview/draft forms are unlisted for everyone,
      // matching the 404 their single-form GET returns to the public.
      if (latest && getRecipeVisibility(latest) === "public")
        out.push({
          formId,
          title: latest.title,
          version: latest.version,
          // Category is the contact-details title (e.g. the owning
          // ministry/department). Omitted when the recipe has no
          // contactDetails so the landing page can fall back to "Unknown".
          ...(latest.contactDetails?.title && {
            category: latest.contactDetails.title,
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
    const versions = this.store.get(formId);
    if (!versions) return null;
    if (version) return versions.get(version) ?? null;
    return this.latestVersion(versions);
  }

  private latestVersion(
    versions: Map<string, ServiceContractRecipe>,
  ): ServiceContractRecipe | null {
    let best: ServiceContractRecipe | null = null;
    for (const recipe of versions.values()) {
      if (!best || compareSemver(recipe.version, best.version) > 0) {
        best = recipe;
      }
    }
    return best;
  }
}
