import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ServiceIndexSource,
  ServiceVisibility,
} from "./build-services-index";
import { findWorkspaceRoot } from "./paths";

const VISIBILITIES: readonly ServiceVisibility[] = [
  "public",
  "preview",
  "draft",
];

export interface LoadFeatureRoutesOptions {
  /**
   * Path to landing's routes dir. Defaults to env `LANDING_ROUTES_DIR` or
   * `apps/landing/src/routes` resolved from the workspace root.
   */
  routesDir?: string;
}

export interface FeatureRoutesArtifact {
  services: ServiceIndexSource[];
  warnings: string[];
}

/**
 * Map raw `-meta.ts` `META` exports to services-index sources. Pure — the
 * validation and shape live here so they're testable without the filesystem.
 * A meta missing `url`/`title` is dropped with a warning rather than crashing
 * generation. Code-route pages never have a form, so `form_id` is omitted.
 */
export function mapFeatureMetasToServices(
  metas: unknown[],
): FeatureRoutesArtifact {
  const services: ServiceIndexSource[] = [];
  const warnings: string[] = [];
  for (const meta of metas) {
    const m = (meta ?? {}) as Record<string, unknown>;
    const url = typeof m.url === "string" ? m.url : "";
    const title = typeof m.title === "string" ? m.title : "";
    if (!url || !title) {
      warnings.push(
        `[feature-route] ${url || "<unknown>"}: -meta.ts META needs a non-empty url and title`,
      );
      continue;
    }
    const category = typeof m.category === "string" ? m.category : undefined;
    const visibility = VISIBILITIES.includes(m.visibility as ServiceVisibility)
      ? (m.visibility as ServiceVisibility)
      : undefined;
    services.push({
      slug: url,
      title,
      ...(category ? { category } : {}),
      ...(visibility ? { visibility } : {}),
    });
  }
  return { services, warnings };
}

/**
 * Discover landing's code-route service pages — the `src/routes/<url>/-meta.ts`
 * `FeatureMeta` modules that the markdown loader (`loadContent`) can't see —
 * and return them as services-index sources so they appear in `GET /services`
 * and become flaggable via the feature-flagging tool.
 *
 * `-meta.ts` files are side-effect-free (type-only imports) by design, so they
 * load by dynamic `import()`. This runs at build time under tsx (the services
 * -index generator), never at api runtime — the api only reads the generated
 * snapshot, so no api→content runtime `.ts` dependency is introduced.
 */
export async function loadFeatureRouteServices(
  opts: LoadFeatureRoutesOptions = {},
): Promise<FeatureRoutesArtifact> {
  const routesDir = await resolveRoutesDir(opts);
  let entries: string[];
  try {
    entries = await readdir(routesDir, { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { services: [], warnings: [] };
    }
    throw err;
  }
  const metaFiles = entries
    .filter((rel) => rel.split(/[\\/]/).pop() === "-meta.ts")
    .sort();
  const metas: unknown[] = [];
  for (const rel of metaFiles) {
    const mod = await import(pathToFileURL(join(routesDir, rel)).href);
    metas.push(mod.META);
  }
  return mapFeatureMetasToServices(metas);
}

async function resolveRoutesDir(
  opts: LoadFeatureRoutesOptions,
): Promise<string> {
  if (opts.routesDir) return opts.routesDir;
  const envDir = process.env.LANDING_ROUTES_DIR;
  if (envDir) return envDir;
  const root = await findWorkspaceRoot(process.cwd());
  const base = root ?? process.cwd();
  return join(base, "apps", "landing", "src", "routes");
}
