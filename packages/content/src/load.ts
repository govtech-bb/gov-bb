import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { serviceFrontmatterSchema } from "./schemas";
import type { ContentArtifact, ServiceEntity } from "./types";

export interface LoadContentOptions {
  /**
   * Path to landing content dir. Defaults to env var `LANDING_CONTENT_DIR`
   * or `apps/landing/src/content` resolved from CWD.
   */
  contentDir?: string;
  /**
   * Extract searchable text from an `.mdx` body (frontmatter already stripped).
   * Injected by the caller so this package stays free of an MDX parser; when
   * omitted, `.mdx` files are skipped.
   */
  mdxToText?: (source: string) => string;
}

async function findWorkspaceRoot(start: string): Promise<string | null> {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    try {
      await stat(join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      // ignore
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
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
  // `.mdx` bodies pass the injected MDX extractor; `.md` uses the identity default.
  transformBody: (source: string) => string = (s) => s,
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
    body: transformBody(content).trim(),
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
  mdxToText?: (source: string) => string,
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
      // A service index may be `.mdx` (migrated) or `.md` (legacy).
      const mdxIndexRaw = mdxToText
        ? await readFileSafe(join(path, "index.mdx"))
        : null;
      const indexIsMdx = mdxIndexRaw !== null;
      const indexPath = join(path, indexIsMdx ? "index.mdx" : "index.md");
      const raw = mdxIndexRaw ?? (await readFileSafe(indexPath));
      if (raw === null) {
        await loadDir(path, `${relPrefix}${name}/`, warnings, out, mdxToText);
        continue;
      }
      const entity = parseService(
        raw,
        `${relPrefix}${name}`,
        indexPath,
        warnings,
        indexIsMdx ? mdxToText : undefined,
      );
      if (!entity) continue;
      const startMdxRaw = mdxToText
        ? await readFileSafe(join(path, "start.mdx"))
        : null;
      const startIsMdx = startMdxRaw !== null;
      const startRaw =
        startMdxRaw ?? (await readFileSafe(join(path, "start.md")));
      if (startRaw) {
        entity.hasStartPage = true;
        const startContent = matter(startRaw).content;
        const startBody = (
          startIsMdx && mdxToText
            ? mdxToText(startContent)
            : startContent.replace(START_LINK_RE, "")
        ).trim();
        if (startBody) {
          // A synthetic heading keeps the start page's lead-in prose from
          // bleeding into whatever section happens to end the index body.
          entity.body = `${entity.body}\n\n## Before you start\n\n${startBody}`;
        }
      }
      out.push(entity);
      continue;
    }

    if (name.endsWith(".mdx")) {
      if (!mdxToText) continue;
      const raw = await readFile(path, "utf8");
      const entity = parseService(
        raw,
        `${relPrefix}${name.slice(0, -4)}`,
        path,
        warnings,
        mdxToText,
      );
      if (entity) out.push(entity);
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
  mdxToText?: (source: string) => string,
): Promise<ServiceEntity[]> {
  const out: ServiceEntity[] = [];
  await loadDir(rootDir, "", warnings, out, mdxToText);
  return out;
}

export async function loadContent(
  opts: LoadContentOptions = {},
): Promise<ContentArtifact> {
  const rootDir = await resolveContentDir(opts);
  const warnings: string[] = [];
  const services = await loadServices(rootDir, warnings, opts.mdxToText);
  return { services, warnings };
}
