import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { findWorkspaceRoot } from "./paths";
import { serviceFrontmatterSchema } from "./schemas";
import type { ContentArtifact, ServiceEntity } from "./types";

export interface LoadContentOptions {
  /**
   * Path to landing content dir. Defaults to env var `LANDING_CONTENT_DIR`
   * or `apps/landing/src/content` resolved from CWD.
   */
  contentDir?: string;
}

async function resolveContentDir(opts: LoadContentOptions): Promise<string> {
  if (opts.contentDir) return opts.contentDir;
  const envDir = process.env.LANDING_CONTENT_DIR;
  if (envDir) return envDir;
  const root = await findWorkspaceRoot(process.cwd());
  if (root) return join(root, "apps", "landing", "src", "content");
  return join(process.cwd(), "apps", "landing", "src", "content");
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// The landing "Start now" anchor is baked client-side from form_id; in plain
// markdown it's just a dangling tag — strip it so chunks stay prose.
const START_LINK_RE = /<a[^>]*data-start-link[^>]*>.*?<\/a>/g;

function parseService(
  raw: string,
  slug: string,
  filePath: string,
  warnings: string[],
): ServiceEntity | null {
  const { data, content } = matter(raw);
  const parsed = serviceFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    warnings.push(
      `[service] ${slug}: ${parsed.error.issues[0]?.message ?? "invalid frontmatter"}`,
    );
    return null;
  }
  return {
    ...parsed.data,
    slug,
    body: content.trim(),
    filePath,
  };
}

// Walks the content tree the same way landing's registry glob does
// (`./**/*.md`), so nothing live on the site is invisible to RAG (#1266):
//   - `<dir>/index.md`        → a service; slug = the dir's relative path
//   - `<dir>/start.md`        → folded into that service as a "Before you
//                               start" section ("what you will need" etc.)
//   - a dir WITHOUT index.md  → a category grouping; recurse into it
//   - any other `*.md`        → a service; slug = relative path minus `.md`
// Top-level slugs are unchanged from the old single-level loader, so existing
// document ids (and their embeddings) stay stable.
async function loadDir(
  dir: string,
  relPrefix: string,
  warnings: string[],
  out: ServiceEntity[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  for (const name of entries) {
    const path = join(dir, name);
    const s = await stat(path);

    if (s.isDirectory()) {
      const indexPath = join(path, "index.md");
      const raw = await readFileSafe(indexPath);
      if (raw === null) {
        await loadDir(path, `${relPrefix}${name}/`, warnings, out);
        continue;
      }
      const entity = parseService(
        raw,
        `${relPrefix}${name}`,
        indexPath,
        warnings,
      );
      if (!entity) continue;
      const startRaw = await readFileSafe(join(path, "start.md"));
      if (startRaw) {
        entity.hasStartPage = true;
        const startBody = matter(startRaw)
          .content.replace(START_LINK_RE, "")
          .trim();
        if (startBody) {
          // A synthetic heading keeps the start page's lead-in prose from
          // bleeding into whatever section happens to end the index body.
          entity.body = `${entity.body}\n\n## Before you start\n\n${startBody}`;
        }
      }
      out.push(entity);
      continue;
    }

    if (!name.endsWith(".md")) continue;
    if (name === "index.md" || name === "start.md") continue; // handled above
    const raw = await readFile(path, "utf8");
    const entity = parseService(
      raw,
      `${relPrefix}${name.slice(0, -3)}`,
      path,
      warnings,
    );
    if (entity) out.push(entity);
  }
}

async function loadServices(
  rootDir: string,
  warnings: string[],
): Promise<ServiceEntity[]> {
  const out: ServiceEntity[] = [];
  await loadDir(rootDir, "", warnings, out);
  return out;
}

export async function loadContent(
  opts: LoadContentOptions = {},
): Promise<ContentArtifact> {
  const rootDir = await resolveContentDir(opts);
  const warnings: string[] = [];
  const services = await loadServices(rootDir, warnings);
  return { services, warnings };
}
