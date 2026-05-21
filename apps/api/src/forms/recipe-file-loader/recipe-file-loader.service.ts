import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { promises as fs, watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import {
  serviceContractRecipeSchema,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";

interface FormEntry {
  latest: ServiceContractRecipe;
  byVersion: Map<string, ServiceContractRecipe>;
}

/**
 * Compare two dot-separated version strings as int arrays.
 * Mirrors the existing `string_to_array(version, '.')::int[]` ordering used
 * by the form-builder server functions, so file-loaded ordering matches DB ordering.
 */
export function compareVersions(a: string, b: string): number {
  const av = a.split(".").map((n) => Number.parseInt(n, 10));
  const bv = b.split(".").map((n) => Number.parseInt(n, 10));
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

@Injectable()
export class RecipeFileLoader implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecipeFileLoader.name);
  private readonly forms = new Map<string, FormEntry>();
  private watcher?: FSWatcher;

  async onModuleInit(): Promise<void> {
    const dir = this.getRecipesDir();
    await this.loadAll(dir);
    if (process.env.NODE_ENV === "development") {
      this.startWatcher(dir);
    }
  }

  onModuleDestroy(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  findLatest(formId: string): ServiceContractRecipe | null {
    return this.forms.get(formId)?.latest ?? null;
  }

  findVersion(formId: string, version: string): ServiceContractRecipe | null {
    return this.forms.get(formId)?.byVersion.get(version) ?? null;
  }

  listFormIds(): string[] {
    return Array.from(this.forms.keys());
  }

  /**
   * Public for testing. Scans `<dir>/{formId}/{version}.json`, validates each
   * file, and replaces the in-memory map. Bad files are logged and skipped.
   */
  async loadAll(dir: string): Promise<void> {
    this.forms.clear();
    let formDirs: string[];
    try {
      formDirs = await fs.readdir(dir);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.warn(
          `Recipes directory not found at ${dir} — loader has no entries`,
        );
        return;
      }
      throw err;
    }

    for (const formId of formDirs) {
      const formPath = path.join(dir, formId);
      let stat;
      try {
        stat = await fs.stat(formPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(formPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        await this.loadOne(path.join(formPath, file));
      }
    }

    this.logger.log(
      `Loaded recipes for ${this.forms.size} form(s) from ${dir}`,
    );
  }

  /**
   * Load a single file. Used at boot and by the dev watcher. Public for testing.
   */
  async loadOne(filePath: string): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      this.logger.error(
        `Failed to read ${filePath}: ${(err as Error).message}`,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.logger.error(
        `Failed to parse ${filePath} as JSON: ${(err as Error).message}`,
      );
      return;
    }

    const result = serviceContractRecipeSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.error(
        `Recipe at ${filePath} failed schema validation: ${result.error.message}`,
      );
      return;
    }

    const recipe = result.data;
    const expectedName = `${recipe.version}.json`;
    const actualName = path.basename(filePath);
    if (actualName !== expectedName) {
      this.logger.error(
        `Recipe at ${filePath} has version "${recipe.version}" but filename is "${actualName}" — skipping`,
      );
      return;
    }

    const expectedParent = recipe.formId;
    const actualParent = path.basename(path.dirname(filePath));
    if (actualParent !== expectedParent) {
      this.logger.error(
        `Recipe at ${filePath} has formId "${recipe.formId}" but parent dir is "${actualParent}" — skipping`,
      );
      return;
    }

    this.upsert(recipe);
  }

  private upsert(recipe: ServiceContractRecipe): void {
    const existing = this.forms.get(recipe.formId);
    if (!existing) {
      this.forms.set(recipe.formId, {
        latest: recipe,
        byVersion: new Map([[recipe.version, recipe]]),
      });
      return;
    }

    existing.byVersion.set(recipe.version, recipe);
    if (compareVersions(recipe.version, existing.latest.version) >= 0) {
      existing.latest = recipe;
    }
  }

  private getRecipesDir(): string {
    return process.env.RECIPES_DIR ?? path.resolve(process.cwd(), "recipes");
  }

  private startWatcher(dir: string): void {
    try {
      this.watcher = watch(dir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        if (!filename.endsWith(".json")) return;
        const full = path.join(dir, filename);
        void this.loadOne(full).catch((err: Error) => {
          this.logger.error(
            `Watcher reload failed for ${full}: ${err.message}`,
          );
        });
      });
      this.logger.log(`Watching recipes dir for changes: ${dir}`);
    } catch (err) {
      this.logger.warn(
        `Could not start recipe watcher (${(err as Error).message}) — recipes will only reload on restart`,
      );
    }
  }
}
