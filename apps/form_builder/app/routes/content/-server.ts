import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "../../server/auth/require-session";
import { sessionTokenOrDev } from "../../server/auth/session-or-dev";
import { resolveBaseBranch } from "../../server/publish";
import {
  repoUrl,
  authHeaders,
  ghError,
  createBranchFrom,
  deleteBranch,
  getContents,
  putFile,
  openPullRequest,
  listOpenPRHeads,
} from "../../server/github";
import {
  asString,
  startPageContentPath,
  isContentPath,
  isKnownCategory,
  isValidSlug,
  insertCategoryEntry,
  parseStartLink,
  CONTENT_ROOT,
  type NewCategory,
  type StartPageInput,
} from "./-lib";
import { renderStartPageMarkdown, parseContentMarkdown } from "./-render";

/**
 * Server functions for authoring landing-app content pages from the standalone
 * /content route. Reuses the recipe Deploy plumbing in `publish.ts` (base
 * branch, repo URL, auth headers) but reads/writes markdown content files and
 * opens its own PR. Never touches the builder's draft/deploy state.
 */

export interface ContentPageSummary {
  path: string;
  title: string;
  category: string;
  visibility: string;
  formId: string;
  /**
   * The page renders the form's Start button directly — a bare
   * `<a data-start-link>` (no href) plus `form_id`. Marks single-page
   * services, whose service page doubles as the start surface.
   */
  hasFormButton: boolean;
}

function summarisePage(path: string, raw: string): ContentPageSummary {
  const { frontmatter: fm, body } = parseContentMarkdown(raw);
  const formId = asString(fm.form_id);
  const link = parseStartLink(body);
  return {
    path,
    title: asString(fm.title),
    category:
      asString(fm.category) ||
      (Array.isArray(fm.categories) ? asString(fm.categories[0]) : ""),
    visibility: asString(fm.visibility) || "public",
    formId,
    hasFormButton: !!formId && link !== null && link.href === "",
  };
}

/** Fallback summary when a page's content couldn't be fetched. */
function emptySummary(path: string): ContentPageSummary {
  return {
    path,
    title: "",
    category: "",
    visibility: "public",
    formId: "",
    hasFormButton: false,
  };
}

/** Absolute path to the sibling landing app's content dir (dev only). */
async function localContentRoot(): Promise<string> {
  const path = await import("node:path");
  return path.resolve(process.cwd(), "../landing/src/content");
}

/** Dev fallback: list content pages by reading the local landing checkout. */
async function readLocalContentPages(): Promise<ContentPageSummary[]> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const root = await localContentRoot();
  const out: ContentPageSummary[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.name.endsWith(".md")) {
        const raw = await fs.readFile(abs, "utf8");
        out.push(summarisePage(CONTENT_ROOT + path.relative(root, abs), raw));
      }
    }
  }
  await walk(root);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Dev fallback: load one content page from the local landing checkout. */
async function readLocalContentFile(repoPath: string): Promise<{
  path: string;
  sha: string;
  frontmatter: Record<string, unknown>;
  body: string;
}> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const abs = path.join(
    await localContentRoot(),
    repoPath.slice(CONTENT_ROOT.length),
  );
  const raw = await fs.readFile(abs, "utf8");
  const { frontmatter, body } = parseContentMarkdown(raw);
  return { path: repoPath, sha: "", frontmatter, body };
}

// The page list is a read-heavy waterfall (one blob fetch per page), so cache
// the resolved summaries briefly — mirrors the 60s catalog cache in registry.ts.
let listCache: { at: number; pages: ContentPageSummary[] } | null = null;
const LIST_TTL_MS = 60_000;

/** List every editable content page on the base branch, with frontmatter. */
export const listLandingContentPages = createServerFn({ method: "GET" })
  .middleware([sessionTokenOrDev])
  .inputValidator(
    z.object({ force: z.boolean().default(false) }).default({ force: false }),
  )
  .handler(async ({ data, context }): Promise<ContentPageSummary[]> => {
    if (!data.force && listCache && Date.now() - listCache.at < LIST_TTL_MS) {
      return listCache.pages;
    }
    const token = context.token;
    if (token === null) {
      const pages = await readLocalContentPages();
      listCache = { at: Date.now(), pages };
      return pages;
    }
    const baseBranch = resolveBaseBranch();
    const res = await fetch(
      repoUrl(`/git/trees/${encodeURIComponent(baseBranch)}?recursive=1`),
      { headers: authHeaders(token) },
    );
    if (!res.ok) throw await ghError("Failed to list landing content", res);
    const json = (await res.json()) as {
      tree?: { path: string; type: string; sha: string }[];
      truncated?: boolean;
    };
    if (json.truncated) {
      console.warn(
        "[content] repo tree truncated — some content pages may be missing from the list",
      );
    }
    const blobs = (json.tree ?? []).filter(
      (e) => e.type === "blob" && isContentPath(e.path),
    );
    const pages = await Promise.all(
      blobs.map(async (e): Promise<ContentPageSummary> => {
        try {
          const blobRes = await fetch(repoUrl(`/git/blobs/${e.sha}`), {
            headers: authHeaders(token),
          });
          if (!blobRes.ok) return emptySummary(e.path);
          const blob = (await blobRes.json()) as { content: string };
          const raw = Buffer.from(blob.content, "base64").toString("utf8");
          return summarisePage(e.path, raw);
        } catch {
          return emptySummary(e.path);
        }
      }),
    );
    pages.sort((a, b) => a.path.localeCompare(b.path));
    listCache = { at: Date.now(), pages };
    return pages;
  });

export interface OpenContentPR {
  path: string;
  prNumber: number;
  prUrl: string;
  branch: string;
}

/** All open content PRs on the base branch — shared by the list endpoint and
 *  the deploy flow (which retargets an existing PR instead of duplicating).
 *  Maps each PR to the content file(s) it actually changes via the PR files
 *  API: parsing the path out of the PR body would silently break the moment
 *  someone edited the description. */
async function fetchOpenContentPRs(
  token: string,
  baseBranch: string,
): Promise<OpenContentPR[]> {
  const candidates = (await listOpenPRHeads(token, baseBranch)).filter((pr) =>
    pr.headRef.startsWith("start-page-"),
  );
  const perPR = await Promise.all(
    candidates.map(async (pr): Promise<OpenContentPR[]> => {
      const res = await fetch(
        repoUrl(`/pulls/${pr.number}/files?per_page=20`),
        { headers: authHeaders(token) },
      );
      if (!res.ok) return [];
      const files = (await res.json()) as { filename: string }[];
      return files
        .filter((f) => isContentPath(f.filename))
        .map((f) => ({
          path: f.filename,
          prNumber: pr.number,
          prUrl: pr.htmlUrl,
          branch: pr.headRef,
        }));
    }),
  );
  return perPR.flat();
}

/** Open content PRs keyed by the file they touch — mirrors listOpenDeployClaims. */
export const listOpenContentPRs = createServerFn({ method: "GET" })
  .middleware([sessionTokenOrDev])
  .handler(async ({ context }): Promise<OpenContentPR[]> => {
    const token = context.token;
    if (token === null) return []; // dev local read — no PRs to surface
    return fetchOpenContentPRs(token, resolveBaseBranch());
  });

/** Load a content page's frontmatter + body for editing. */
export const loadLandingContentPage = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([sessionTokenOrDev])
  .inputValidator(z.object({ path: z.string() }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      path: string;
      sha: string;
      frontmatter: Record<string, unknown>;
      body: string;
    }> => {
      if (!isContentPath(data.path)) {
        throw new Error(`Not a landing content path: ${data.path}`);
      }
      const token = context.token;
      if (token === null) return readLocalContentFile(data.path);
      const res = await getContents(token, data.path, resolveBaseBranch());
      if (!res.ok) throw await ghError("Failed to load page", res);
      const json = (await res.json()) as { content: string; sha: string };
      const raw = Buffer.from(json.content, "base64").toString("utf8");
      const { frontmatter, body } = parseContentMarkdown(raw);
      return { path: data.path, sha: json.sha, frontmatter, body };
    },
  );

function renderPrBody(
  args: {
    title: string;
    path: string;
    formId: string;
    category: string;
    visibility: string;
    isUpdate: boolean;
    description: string;
    newCategory?: string;
  },
  authorLogin: string,
): string {
  const desc = args.description.trim();
  return [
    `## ${args.isUpdate ? "Update" : "Add"} landing page`,
    "",
    `- Page: **${args.title}**`,
    `- File: \`${args.path}\``,
    args.formId ? `- Links to form: \`${args.formId}\`` : `- No linked form`,
    args.category ? `- Category: \`${args.category}\`` : null,
    args.newCategory
      ? `- **Creates new category** \`${args.newCategory}\` (categories.ts)`
      : null,
    `- Visibility: \`${args.visibility}\``,
    `- Author: @${authorLogin}`,
    "",
    "### Description",
    "",
    desc.length > 0 ? desc : "_No description provided._",
    "",
    "---",
    "",
    "Generated by the form_builder Content flow.",
    "Page content is in the file diff for this PR.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dot-free, kebab branch segment derived from a content path. */
function branchSlugFromPath(path: string): string {
  return (
    path
      .slice(CONTENT_ROOT.length)
      .replace(/\.md$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "page"
  );
}

const CATEGORIES_TS = "apps/landing/src/content/categories.ts";

/** Add a category entry to landing's categories.ts on `branch` (same PR). */
async function addCategoryOnBranch(
  token: string,
  branch: string,
  cat: NewCategory,
): Promise<void> {
  const res = await getContents(token, CATEGORIES_TS, branch);
  if (!res.ok) throw await ghError("Failed to read categories.ts", res);
  const json = (await res.json()) as { content: string; sha: string };
  const source = Buffer.from(json.content, "base64").toString("utf8");
  const next = insertCategoryEntry(source, cat);
  if (next === null) {
    throw new Error(
      "Couldn't add the category automatically — categories.ts has an " +
        "unexpected shape. Add it by hand in apps/landing/src/content/categories.ts.",
    );
  }
  if (next === source) return; // already present on this branch
  const putRes = await putFile(token, {
    path: CATEGORIES_TS,
    message: `Add landing category ${cat.slug}`,
    content: next,
    branch,
    sha: json.sha,
  });
  if (!putRes.ok) throw await ghError("Failed to update categories.ts", putRes);
}

/** Push a deploy onto the PR already open for this file instead of opening a
 *  duplicate (which would merge-conflict with the first). The content analog
 *  of the forms version reservation (#873). */
async function pushToExistingPR(
  token: string,
  pr: OpenContentPR,
  targetPath: string,
  markdown: string,
  newCategory: NewCategory | undefined,
): Promise<{
  prUrl: string;
  prNumber: number;
  path: string;
  updatedExistingPR: boolean;
}> {
  if (newCategory) {
    await addCategoryOnBranch(token, pr.branch, newCategory);
  }
  // The file may not exist on the PR branch yet (e.g. the PR only touches
  // categories.ts) — only pass a sha when it does.
  const onBranch = await getContents(token, targetPath, pr.branch);
  let branchSha: string | undefined;
  if (onBranch.status === 200) {
    branchSha = ((await onBranch.json()) as { sha: string }).sha;
  } else if (onBranch.status !== 404) {
    throw await ghError("Failed to read page on the open PR", onBranch);
  }
  const putRes = await putFile(token, {
    path: targetPath,
    message: `Update landing page ${targetPath.slice(CONTENT_ROOT.length)}`,
    content: markdown,
    branch: pr.branch,
    sha: branchSha,
  });
  if (!putRes.ok) {
    throw await ghError("Failed to update the open PR", putRes);
  }
  return {
    prUrl: pr.prUrl,
    prNumber: pr.prNumber,
    path: targetPath,
    updatedExistingPR: true,
  };
}

export const publishStartPage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string().default(""),
      slug: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      category: z.string().default(""),
      subcategory: z.string().optional(),
      body: z.string().min(1),
      buttonLabel: z.string().default("Start now"),
      linkType: z.enum(["form", "slug", "external", "none"]).optional(),
      linkHref: z.string().optional(),
      visibility: z.enum(["public", "preview", "draft"]).default("draft"),
      /** Free-text "what changed and why" for the PR body (not the page). */
      prDescription: z.string().default(""),
      /** A category being created alongside this page (same PR). */
      newCategory: z
        .object({
          slug: z.string().min(1),
          title: z.string().min(1),
          description: z.string().optional(),
        })
        .optional(),
      /** Edit mode: the repo path + blob sha of the page being updated. */
      path: z.string().optional(),
      sha: z.string().optional(),
      /** Edit mode: the loaded frontmatter, merged under managed fields. */
      baseFrontmatter: z.record(z.string(), z.unknown()).optional(),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      prUrl: string;
      prNumber: number;
      path: string;
      updatedExistingPR: boolean;
    }> => {
      const token = context.session.accessToken;
      const baseBranch = resolveBaseBranch();
      const isUpdate = Boolean(data.sha);

      // A category created alongside this page: validated up front; the
      // categories.ts edit rides the same branch/PR as the page.
      const newCategory = data.newCategory;
      if (newCategory) {
        if (!isValidSlug(newCategory.slug)) {
          throw new Error(`Invalid category slug: "${newCategory.slug}"`);
        }
        if (isKnownCategory(newCategory.slug)) {
          throw new Error(
            `Category "${newCategory.slug}" already exists — pick it from the list.`,
          );
        }
      }

      // Resolve the target file path. Edit mode carries the loaded repo path
      // (which may be nested, e.g. <service>/start.md); create mode derives a
      // top-level <slug>.md. Both are validated before any path interpolation.
      let targetPath: string;
      if (data.path) {
        if (!isContentPath(data.path)) {
          throw new Error(`Not a landing content path: ${data.path}`);
        }
        targetPath = data.path;
      } else {
        const slug = data.slug?.trim() || data.formId.trim();
        if (!slug) throw new Error("A slug or form ID is required.");
        targetPath = startPageContentPath(slug);
      }

      const input: StartPageInput = {
        formId: data.formId,
        slug: data.slug?.trim() || data.formId,
        title: data.title,
        description: data.description,
        category: data.category,
        subcategory: data.subcategory,
        body: data.body,
        buttonLabel: data.buttonLabel,
        linkType: data.linkType,
        linkHref: data.linkHref,
        visibility: data.visibility,
        publishDate: todayIso(),
      };
      const markdown = renderStartPageMarkdown(input, {
        baseFrontmatter: data.baseFrontmatter,
        allowCategories: newCategory ? [newCategory.slug] : undefined,
      });
      const leaf = targetPath.slice(CONTENT_ROOT.length);

      const existingPR = (await fetchOpenContentPRs(token, baseBranch)).find(
        (pr) => pr.path === targetPath,
      );
      if (existingPR) {
        return pushToExistingPR(
          token,
          existingPR,
          targetPath,
          markdown,
          newCategory,
        );
      }

      // Dot-free branch name: the Amplify preview cert is single-label (see
      // CLAUDE.md "Never put a `.` in a branch name").
      const branch = `start-page-${branchSlugFromPath(targetPath)}-${Date.now()}`;
      await createBranchFrom(token, baseBranch, branch);

      try {
        if (newCategory) {
          await addCategoryOnBranch(token, branch, newCategory);
        }

        // Create mode refuses to clobber an existing file (a PR with no diff
        // would fail anyway, and a hand-edited page mustn't be silently
        // replaced). Update mode targets a known file by its blob sha.
        if (!isUpdate) {
          const checkRes = await getContents(token, targetPath, branch);
          if (checkRes.status === 200) {
            throw new Error(
              `A page already exists at ${targetPath}. Open it to edit instead.`,
            );
          }
          if (checkRes.status !== 404) {
            throw await ghError("Failed to check existing page", checkRes);
          }
        }

        const putRes = await putFile(token, {
          path: targetPath,
          message: `${isUpdate ? "Update" : "Add"} landing page ${leaf}`,
          content: markdown,
          branch,
          sha: isUpdate ? data.sha : undefined,
        });
        if (isUpdate && (putRes.status === 409 || putRes.status === 422)) {
          // Stale blob sha: the file changed on the base branch after the
          // author opened it. Surface the real situation instead of GitHub's
          // raw conflict error.
          throw new Error(
            `This page changed on ${baseBranch} since you opened it. ` +
              `Reopen the page to pick up the latest, then re-apply your edits.`,
          );
        }
        if (!putRes.ok) {
          throw await ghError("Failed to write page file", putRes);
        }

        const pr = await openPullRequest(token, {
          base: baseBranch,
          head: branch,
          title: `${isUpdate ? "Update" : "Add"} landing page: ${input.title}`,
          body: renderPrBody(
            {
              title: input.title,
              path: targetPath,
              formId: input.formId.trim(),
              category: input.category.trim(),
              visibility: input.visibility,
              isUpdate,
              description: data.prDescription,
              newCategory: newCategory?.slug,
            },
            context.session.login,
          ),
        });
        return { ...pr, path: targetPath, updatedExistingPR: false };
      } catch (err) {
        await deleteBranch(branch, token);
        throw err;
      }
    },
  );

/** Open a PR that removes a content page (the deploy-flow counterpart to delete). */
export const deleteContentPage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ path: z.string(), title: z.string().default("") }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ prUrl: string; prNumber: number; path: string }> => {
      if (!isContentPath(data.path)) {
        throw new Error(`Not a landing content path: ${data.path}`);
      }
      const token = context.session.accessToken;
      const baseBranch = resolveBaseBranch();
      const leaf = data.path.slice(CONTENT_ROOT.length);

      const branch = `start-page-${branchSlugFromPath(data.path)}-${Date.now()}`;
      await createBranchFrom(token, baseBranch, branch);

      try {
        // The Contents DELETE needs the file's current blob sha on the branch.
        const getRes = await getContents(token, data.path, branch);
        if (getRes.status === 404) {
          throw new Error(`No page found at ${data.path} — nothing to remove.`);
        }
        if (!getRes.ok) throw await ghError("Failed to read page", getRes);
        const sha = ((await getRes.json()) as { sha: string }).sha;

        const delRes = await fetch(repoUrl(`/contents/${data.path}`), {
          method: "DELETE",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Remove landing page ${leaf}`,
            sha,
            branch,
          }),
        });
        if (!delRes.ok) throw await ghError("Failed to remove page", delRes);

        const pr = await openPullRequest(token, {
          base: baseBranch,
          head: branch,
          title: `Remove landing page: ${data.title || leaf}`,
          body: [
            "## Remove landing page",
            "",
            `- Page: **${data.title || leaf}**`,
            `- File: \`${data.path}\``,
            `- Author: @${context.session.login}`,
            "",
            "---",
            "",
            "Generated by the form_builder Content flow.",
          ].join("\n"),
        });
        return { ...pr, path: data.path };
      } catch (err) {
        await deleteBranch(branch, token);
        throw err;
      }
    },
  );
