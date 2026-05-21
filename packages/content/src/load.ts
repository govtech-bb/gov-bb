import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { mdaFrontmatterSchema, serviceFrontmatterSchema } from "./schemas";
import type { ContentArtifact, MdaEntity, ServiceEntity } from "./types";

const ORG_DIR = join("government", "organisations");

export interface LoadContentOptions {
  /**
   * Path to landing content dir. Defaults to env var `LANDING_CONTENT_DIR`
   * or `apps/landing/src/content` resolved from CWD.
   */
  contentDir?: string;
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

async function loadMdas(
  rootDir: string,
  warnings: string[],
): Promise<MdaEntity[]> {
  const dir = join(rootDir, ORG_DIR);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const out: MdaEntity[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const filePath = join(dir, name);
    const raw = await readFile(filePath, "utf8");
    const { data, content } = matter(raw);
    const parsed = mdaFrontmatterSchema.safeParse(data);
    if (!parsed.success) {
      warnings.push(
        `[mda] ${name}: ${parsed.error.issues[0]?.message ?? "invalid frontmatter"}`,
      );
      continue;
    }
    out.push({
      ...parsed.data,
      body: content.trim(),
      filePath,
    });
  }
  return out;
}

async function loadServices(
  rootDir: string,
  warnings: string[],
): Promise<ServiceEntity[]> {
  let entries: string[];
  try {
    entries = await readdir(rootDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const out: ServiceEntity[] = [];
  for (const name of entries) {
    if (name === "government") continue;
    const path = join(rootDir, name);
    const s = await stat(path);

    let slug: string;
    let raw: string | null;
    let filePath: string;

    if (s.isDirectory()) {
      slug = name;
      filePath = join(path, "index.md");
      raw = await readFileSafe(filePath);
      if (!raw) continue;
    } else {
      if (!name.endsWith(".md")) continue;
      slug = name.slice(0, -3);
      filePath = path;
      raw = await readFile(path, "utf8");
    }

    const { data, content } = matter(raw);
    const parsed = serviceFrontmatterSchema.safeParse(data);
    if (!parsed.success) {
      warnings.push(
        `[service] ${name}: ${parsed.error.issues[0]?.message ?? "invalid frontmatter"}`,
      );
      continue;
    }
    out.push({
      ...parsed.data,
      slug,
      body: content.trim(),
      filePath,
    });
  }
  return out;
}

export async function loadContent(
  opts: LoadContentOptions = {},
): Promise<ContentArtifact> {
  const rootDir = await resolveContentDir(opts);
  const warnings: string[] = [];
  const mdas = await loadMdas(rootDir, warnings);
  const services = await loadServices(rootDir, warnings);
  return { mdas, services, warnings };
}
