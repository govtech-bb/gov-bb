import {
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import * as fs from "node:fs/promises";
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
 * Parse a semver string ("1.10.2") into a tuple of integers. Falls back to
 * [-Infinity] for non-numeric tokens so they sort below valid versions.
 */
function parseVersion(v: string): number[] {
  return v.split(".").map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isFinite(n) ? n : -Infinity;
  });
}

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

/** Returns positive if a > b, negative if a < b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const aa = parseVersion(a);
  const bb = parseVersion(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

@Injectable()
export class RecipeFileLoaderService implements OnModuleInit {
  private readonly logger = new Logger(RecipeFileLoaderService.name);
  private readonly recipesRoot: string;
  // formId → version → recipe
  private store = new Map<string, Map<string, ServiceContractRecipe>>();

  // `@Optional()` tells NestJS DI to inject `undefined` when no provider is
  // registered for the string parameter. Tests bypass DI and pass a root
  // explicitly. Production resolves to DEFAULT_RECIPES_ROOT.
  constructor(@Optional() recipesRoot?: string) {
    this.recipesRoot = recipesRoot ?? DEFAULT_RECIPES_ROOT;
  }

  async onModuleInit(): Promise<void> {
    await this.loadAll();
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

  findAll(): { formId: string; title: string; version: string }[] {
    const out: { formId: string; title: string; version: string }[] = [];
    for (const [formId, versions] of this.store) {
      const latest = this.latestVersion(versions);
      if (latest)
        out.push({ formId, title: latest.title, version: latest.version });
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
