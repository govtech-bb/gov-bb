import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import matter from "gray-matter";
import { compilePage, COMPILER_VERSION } from "../compile/index.js";
import { buildPages, type SeedFile } from "./pages.js";

/** Both recipes ship `meta.visibility: "public"`; this is what hides death. */
const VISIBILITY_OVERRIDES: Record<string, string> = {
  "get-death-certificate": "preview",
};

function walkMarkdown(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "forms") continue;
      files.push(...walkMarkdown(join(dir, entry.name)));
    } else if (entry.name.endsWith(".md")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

function readPageFiles(seedDir: string): SeedFile[] {
  return walkMarkdown(seedDir)
    .map((absPath) => {
      const path = relative(seedDir, absPath).split(sep).join("/");
      const { data, content } = matter(readFileSync(absPath, "utf8"));
      return { path, raw: data, body: content };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function readFormFiles(
  seedDir: string,
): { formId: string; visibility: string }[] {
  const formsDir = join(seedDir, "forms");
  return readdirSync(formsDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const recipe = JSON.parse(readFileSync(join(formsDir, name), "utf8"));
      const formId = recipe.formId as string;
      const visibility = VISIBILITY_OVERRIDES[formId] ?? recipe.meta.visibility;
      return { formId, visibility };
    });
}

/**
 * Validate, derive and compile every page and form under `seedDir`, then
 * replace both tables' rows in one transaction. Any failure — a bad page's
 * frontmatter, an unknown category, or a duplicate slug/URL — rolls the
 * transaction back and leaves the previous rows in place.
 */
export async function seed(
  db: DatabaseSync,
  seedDir: string,
): Promise<{ pages: number; forms: number }> {
  const pages = buildPages(readPageFiles(seedDir));
  const forms = readFormFiles(seedDir);
  const compiled = await Promise.all(
    pages.map(async (page) => ({
      page,
      tree: await compilePage(page.body, page.frontmatter.form_id),
    })),
  );

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM pages; DELETE FROM forms;");

    const insertPage = db.prepare(
      `INSERT INTO pages (slug, url, visibility, frontmatter, body_markdown, hast, compiler_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const updatedAt = new Date().toISOString();
    for (const { page, tree } of compiled) {
      try {
        insertPage.run(
          page.slug,
          page.url,
          page.frontmatter.visibility,
          JSON.stringify(page.frontmatter),
          page.body,
          JSON.stringify(tree),
          COMPILER_VERSION,
          updatedAt,
        );
      } catch (err) {
        throw new Error(
          `Failed to insert page "${page.slug}": ${(err as Error).message}`,
        );
      }
    }

    const insertForm = db.prepare(
      "INSERT INTO forms (form_id, visibility) VALUES (?, ?)",
    );
    for (const form of forms) {
      insertForm.run(form.formId, form.visibility);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { pages: compiled.length, forms: forms.length };
}
