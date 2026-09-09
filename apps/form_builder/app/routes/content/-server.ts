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
  commentOnPR,
} from "../../server/github";
import { REPO_NAME, repoOwner } from "../../server/github-repo";
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

export type ContentReviewChangeType =
  | "added"
  | "modified"
  | "removed"
  | "renamed"
  | "other";

export interface ContentReviewClaim {
  path: string;
  previousPath?: string;
  changeType: ContentReviewChangeType;
  prNumber: number;
  prUrl: string;
  branch: string;
  headSha: string;
  writable: boolean;
  summary?: ContentPageSummary;
}

export interface ContentReviewSnapshot {
  claims: ContentReviewClaim[];
  /** False means at least one GitHub response was unavailable or incomplete. */
  complete: boolean;
  warning?: string;
}

export type ContentRevision =
  | { source: "absent" }
  | { source: "base"; sha: string }
  | {
      source: "pr";
      sha: string;
      prNumber: number;
      branch: string;
      headSha: string;
    };

export interface ContentReviewBlock {
  kind: "removal" | "rename" | "external" | "multiple";
  message: string;
  claims: ContentReviewClaim[];
}

export interface LoadedContentPage {
  path: string;
  sha: string;
  frontmatter: Record<string, unknown>;
  body: string;
  revision: Exclude<ContentRevision, { source: "absent" }>;
  reviewBlock?: ContentReviewBlock;
}

export interface ContentDeployConflict {
  kind:
    | "review-unavailable"
    | "missing-revision"
    | "review-changed"
    | "stale-revision"
    | "multiple-reviews"
    | "non-editable-review"
    | "path-exists";
  message: string;
  claims: ContentReviewClaim[];
}

export type PublishStartPageResult =
  | {
      status: "success";
      prUrl: string;
      prNumber: number;
      path: string;
      updatedExistingPR: boolean;
      warning?: string;
    }
  | { status: "conflict"; conflict: ContentDeployConflict };

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
      throw new Error(
        "The repository tree was incomplete. Refresh before creating or deploying pages.",
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

/** Backwards-compatible name while the UI migrates to review claims. */
export type OpenContentPR = ContentReviewClaim;

const CONTENT_PR_MARKER = "Generated by the form_builder Content flow.";

function normaliseChangeType(status: string): ContentReviewChangeType {
  if (
    status === "added" ||
    status === "modified" ||
    status === "removed" ||
    status === "renamed"
  ) {
    return status;
  }
  return "other";
}

function exactContentBranch(path: string, branch: string): boolean {
  const escaped = branchSlugFromPath(path).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  return new RegExp(`^start-page-${escaped}-\\d+$`).test(branch);
}

async function listPRFiles(
  token: string,
  prNumber: number,
): Promise<
  {
    filename: string;
    previous_filename?: string;
    status: string;
  }[]
> {
  const files: {
    filename: string;
    previous_filename?: string;
    status: string;
  }[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(
      repoUrl(`/pulls/${prNumber}/files?per_page=100&page=${page}`),
      { headers: authHeaders(token) },
    );
    if (!res.ok) throw await ghError(`Failed to read PR #${prNumber}`, res);
    const batch = (await res.json()) as typeof files;
    files.push(...batch);
    if (batch.length < 100) return files;
  }
  throw new Error(`PR #${prNumber} has too many files to inspect safely.`);
}

/**
 * Resolve review claims from PR file diffs. Read paths from the PR head so a
 * page that has not reached the base branch still carries real list metadata.
 * Partial failures are returned explicitly and are fatal to every write path.
 */
async function fetchOpenContentPRs(
  token: string,
  baseBranch: string,
): Promise<ContentReviewSnapshot> {
  let candidates;
  try {
    candidates = (await listOpenPRHeads(token, baseBranch)).filter((pr) =>
      pr.headRef.startsWith("start-page-"),
    );
  } catch {
    return {
      claims: [],
      complete: false,
      warning: "Open pull requests could not be checked.",
    };
  }

  const repoFullName = `${repoOwner()}/${REPO_NAME}`.toLowerCase();
  const settled = await Promise.allSettled(
    candidates.map(async (pr): Promise<ContentReviewClaim[]> => {
      if (!pr.headSha) {
        throw new Error(`PR #${pr.number} has no readable head revision.`);
      }
      const files = await listPRFiles(token, pr.number);
      return Promise.all(
        files
          .filter(
            (file) =>
              isContentPath(file.filename) ||
              (file.previous_filename != null &&
                isContentPath(file.previous_filename)),
          )
          .map(async (file): Promise<ContentReviewClaim> => {
            const path = isContentPath(file.filename)
              ? file.filename
              : file.previous_filename!;
            const changeType = normaliseChangeType(file.status);
            const sameRepo =
              pr.headRepoFullName?.toLowerCase() === repoFullName;
            let summary: ContentPageSummary | undefined;
            if (changeType !== "removed" && isContentPath(file.filename)) {
              // A fork's commit may not be addressable through the base repo's
              // Contents API. Its path still becomes a read-only picker row;
              // same-repo reviews must yield exact metadata or the snapshot is
              // incomplete and writes fail closed.
              if (sameRepo) {
                const pageRes = await getContents(
                  token,
                  file.filename,
                  pr.headSha!,
                );
                if (!pageRes.ok) {
                  throw await ghError(
                    `Failed to read page from PR #${pr.number}`,
                    pageRes,
                  );
                }
                const pageJson = (await pageRes.json()) as {
                  content?: string;
                };
                if (!pageJson.content) {
                  throw new Error(
                    `PR #${pr.number} page content is unavailable.`,
                  );
                }
                summary = summarisePage(
                  file.filename,
                  Buffer.from(pageJson.content, "base64").toString("utf8"),
                );
              }
            }
            return {
              path,
              previousPath:
                file.previous_filename && isContentPath(file.previous_filename)
                  ? file.previous_filename
                  : undefined,
              changeType,
              prNumber: pr.number,
              prUrl: pr.htmlUrl,
              branch: pr.headRef,
              headSha: pr.headSha!,
              writable:
                sameRepo &&
                pr.body?.includes(CONTENT_PR_MARKER) === true &&
                (changeType === "added" || changeType === "modified") &&
                exactContentBranch(path, pr.headRef),
              summary,
            };
          }),
      );
    }),
  );

  const claims: ContentReviewClaim[] = [];
  let complete = true;
  for (const result of settled) {
    if (result.status === "fulfilled") claims.push(...result.value);
    else complete = false;
  }
  return {
    claims,
    complete,
    ...(complete
      ? {}
      : { warning: "Some pull requests could not be checked." }),
  };
}

function claimsForPath(
  snapshot: ContentReviewSnapshot,
  path: string,
): ContentReviewClaim[] {
  return snapshot.claims.filter(
    (claim) => claim.path === path || claim.previousPath === path,
  );
}

function reviewBlockForClaims(
  claims: ContentReviewClaim[],
): ContentReviewBlock | undefined {
  if (claims.length > 1) {
    return {
      kind: "multiple",
      message: `This page is changed by ${claims
        .map((claim) => `PR #${claim.prNumber}`)
        .join(" and ")}. Resolve or close one before editing here.`,
      claims,
    };
  }
  const claim = claims[0];
  if (!claim) return undefined;
  if (claim.changeType === "removed") {
    return {
      kind: "removal",
      message: `Removal is already in review in PR #${claim.prNumber}. Resolve that PR before editing this page.`,
      claims,
    };
  }
  if (claim.changeType === "renamed" || claim.changeType === "other") {
    return {
      kind: "rename",
      message: `PR #${claim.prNumber} changes this page in a way the builder cannot safely edit. Continue in GitHub or close that PR first.`,
      claims,
    };
  }
  if (!claim.writable) {
    return {
      kind: "external",
      message: `PR #${claim.prNumber} is reviewable here but its branch is not safe for builder writes. Continue in GitHub or close that PR first.`,
      claims,
    };
  }
  return undefined;
}

/** Review-aware content PR inventory used by both picker and deploy guards. */
export const listOpenContentPRs = createServerFn({ method: "GET" })
  .middleware([sessionTokenOrDev])
  .handler(async ({ context }): Promise<ContentReviewSnapshot> => {
    const token = context.token;
    if (token === null) return { claims: [], complete: true };
    return fetchOpenContentPRs(token, resolveBaseBranch());
  });

/** Load a content page's frontmatter + body for editing. */
export const loadLandingContentPage = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([sessionTokenOrDev])
  .inputValidator(z.object({ path: z.string() }))
  .handler(async ({ data, context }): Promise<LoadedContentPage> => {
    if (!isContentPath(data.path)) {
      throw new Error(`Not a landing content path: ${data.path}`);
    }
    const token = context.token;
    if (token === null) {
      const page = await readLocalContentFile(data.path);
      return {
        ...page,
        revision: { source: "base", sha: page.sha },
      };
    }
    const baseBranch = resolveBaseBranch();
    const snapshot = await fetchOpenContentPRs(token, baseBranch);
    if (!snapshot.complete) {
      throw new Error(
        "Review status couldn’t be checked. Refresh and try again; your draft is safe.",
      );
    }
    const claims = claimsForPath(snapshot, data.path);
    const reviewBlock = reviewBlockForClaims(claims);
    const readableClaim = claims.find(
      (claim) => claim.path === data.path && claim.changeType !== "removed",
    );
    let res = readableClaim
      ? await getContents(token, data.path, readableClaim.headSha)
      : await getContents(token, data.path, baseBranch);
    let revision: LoadedContentPage["revision"] = readableClaim
      ? {
          source: "pr",
          sha: "",
          prNumber: readableClaim.prNumber,
          branch: readableClaim.branch,
          headSha: readableClaim.headSha,
        }
      : { source: "base", sha: "" };
    if (res.status === 404 && readableClaim && !readableClaim.writable) {
      res = await getContents(token, data.path, baseBranch);
      revision = { source: "base", sha: "" };
    }
    if (!res.ok) throw await ghError("Failed to load page", res);
    const json = (await res.json()) as { content: string; sha: string };
    const raw = Buffer.from(json.content, "base64").toString("utf8");
    const { frontmatter, body } = parseContentMarkdown(raw);
    return {
      path: data.path,
      sha: json.sha,
      frontmatter,
      body,
      revision: { ...revision, sha: json.sha },
      reviewBlock,
    };
  });

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
    CONTENT_PR_MARKER,
    "Page content is in the file diff for this PR.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function categoryFromEncodedPage(content?: string): string | undefined {
  if (!content) return undefined;
  try {
    const { frontmatter } = parseContentMarkdown(
      Buffer.from(content, "base64").toString("utf8"),
    );
    return (
      asString(frontmatter.category) ||
      (Array.isArray(frontmatter.categories)
        ? asString(frontmatter.categories[0])
        : "") ||
      undefined
    );
  } catch {
    return undefined;
  }
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

/** Flat and folder-index files can claim the same public URL. */
function equivalentContentPath(path: string): string | null {
  let candidate: string;
  if (path.endsWith("/index.md")) {
    candidate = `${path.slice(0, -"/index.md".length)}.md`;
  } else if (path.endsWith(".md")) {
    candidate = `${path.slice(0, -3)}/index.md`;
  } else {
    return null;
  }
  return isContentPath(candidate) ? candidate : null;
}

const CATEGORIES_TS = "packages/content/src/categories.ts";

/**
 * Add a category entry to the canonical taxonomy
 * (`packages/content/src/categories.ts`) on `branch` (same PR). Landing
 * re-exports this file, so the new category appears in both apps from one edit.
 */
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
        "unexpected shape. Add it by hand in packages/content/src/categories.ts.",
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

async function githubJson<T>(
  token: string,
  suffix: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  const res = await fetch(repoUrl(suffix), {
    ...init,
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw await ghError(label, res);
  return (await res.json()) as T;
}

/**
 * Create one commit containing every file and advance the PR ref only when it
 * still points at `expectedHeadSha`. A concurrent commit makes the ref update
 * non-fast-forward, leaving the newly-created objects unreachable and the PR
 * unchanged rather than applying half an update.
 */
async function commitFilesToExistingPR(
  token: string,
  branch: string,
  expectedHeadSha: string,
  message: string,
  files: { path: string; content: string }[],
): Promise<boolean> {
  const commit = await githubJson<{ tree: { sha: string } }>(
    token,
    `/git/commits/${expectedHeadSha}`,
    { method: "GET" },
    "Failed to read the open PR revision",
  );
  const blobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      sha: (
        await githubJson<{ sha: string }>(
          token,
          "/git/blobs",
          {
            method: "POST",
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          },
          `Failed to prepare ${file.path}`,
        )
      ).sha,
    })),
  );
  const tree = await githubJson<{ sha: string }>(
    token,
    "/git/trees",
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: blobs.map((blob) => ({
          path: blob.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })),
      }),
    },
    "Failed to prepare the PR update",
  );
  const nextCommit = await githubJson<{ sha: string }>(
    token,
    "/git/commits",
    {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [expectedHeadSha],
      }),
    },
    "Failed to create the PR update",
  );
  const update = await fetch(repoUrl(`/git/refs/heads/${branch}`), {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });
  if (update.status === 409 || update.status === 422) return false;
  if (!update.ok) throw await ghError("Failed to update the open PR", update);
  return true;
}

/** Push a deploy onto the PR already open for this file instead of opening a
 * duplicate. Page + category changes become one conditional commit. */
async function pushToExistingPR(
  token: string,
  pr: ContentReviewClaim,
  targetPath: string,
  markdown: string,
  newCategory: NewCategory | undefined,
  prDescription: string,
  authorLogin: string,
): Promise<PublishStartPageResult> {
  const files = [{ path: targetPath, content: markdown }];
  if (newCategory) {
    const categoryRes = await getContents(token, CATEGORIES_TS, pr.headSha);
    if (!categoryRes.ok) {
      throw await ghError("Failed to read categories.ts", categoryRes);
    }
    const categoryJson = (await categoryRes.json()) as { content: string };
    const source = Buffer.from(categoryJson.content, "base64").toString("utf8");
    const next = insertCategoryEntry(source, newCategory);
    if (next === null) {
      throw new Error(
        "Couldn’t add the category automatically. Add it in GitHub, then try again.",
      );
    }
    if (next !== source) files.push({ path: CATEGORIES_TS, content: next });
  }
  const committed = await commitFilesToExistingPR(
    token,
    pr.branch,
    pr.headSha,
    `Update landing page ${targetPath.slice(CONTENT_ROOT.length)}`,
    files,
  );
  if (!committed) {
    return conflictResult(
      "stale-revision",
      `PR #${pr.prNumber} changed while this update was being prepared. Your draft is safe; reload the page before deploying.`,
      [pr],
    );
  }

  let warning: string | undefined;
  const description = prDescription.trim();
  if (description) {
    try {
      await commentOnPR(
        token,
        pr.prNumber,
        `**Updated from the content builder by @${authorLogin}**\n\n${description}`,
      );
    } catch {
      warning =
        "The page was updated, but the description could not be added to the PR. Add it in GitHub if reviewers need it.";
    }
  }
  return {
    status: "success",
    prUrl: pr.prUrl,
    prNumber: pr.prNumber,
    path: targetPath,
    updatedExistingPR: true,
    warning,
  };
}

function conflictResult(
  kind: ContentDeployConflict["kind"],
  message: string,
  claims: ContentReviewClaim[] = [],
): PublishStartPageResult {
  return { status: "conflict", conflict: { kind, message, claims } };
}

const contentRevisionSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("absent") }),
  z.object({ source: z.literal("base"), sha: z.string() }),
  z.object({
    source: z.literal("pr"),
    sha: z.string(),
    prNumber: z.number().int().positive(),
    branch: z.string().min(1),
    headSha: z.string().min(1),
  }),
]);

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
      /** Exact source revision the editor loaded, or an absent-path claim. */
      expectedRevision: contentRevisionSchema.optional(),
      /** Edit mode: the loaded frontmatter, merged under managed fields. */
      baseFrontmatter: z.record(z.string(), z.unknown()).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<PublishStartPageResult> => {
    const token = context.session.accessToken;
    const baseBranch = resolveBaseBranch();
    const expectedRevision = data.expectedRevision;
    const isUpdate = expectedRevision?.source !== "absent";

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

    if (!expectedRevision) {
      return conflictResult(
        "missing-revision",
        "This editor session has no source revision. Refresh the page before deploying; your draft is safe.",
      );
    }

    const snapshot = await fetchOpenContentPRs(token, baseBranch);
    if (!snapshot.complete) {
      return conflictResult(
        "review-unavailable",
        "Review status couldn’t be checked. Refresh and try again; no branch or pull request was created.",
        snapshot.claims,
      );
    }
    const equivalentPath = equivalentContentPath(targetPath);
    const targetClaims = snapshot.claims.filter(
      (claim) => claim.path === targetPath || claim.previousPath === targetPath,
    );
    const collisionClaims = equivalentPath
      ? snapshot.claims.filter(
          (claim) =>
            claim.path === equivalentPath ||
            claim.previousPath === equivalentPath,
        )
      : [];
    let currentCategory: string | undefined;

    if (targetClaims.length > 1) {
      return conflictResult(
        "multiple-reviews",
        `This page is changed by ${targetClaims
          .map((claim) => `PR #${claim.prNumber}`)
          .join(" and ")}. Resolve or close one before deploying.`,
        targetClaims,
      );
    }

    const rivalCollisionClaims = collisionClaims.filter(
      (claim) => !targetClaims.includes(claim),
    );
    if (rivalCollisionClaims.length > 0) {
      return conflictResult(
        "path-exists",
        `Another page for this URL is already in review in ${rivalCollisionClaims
          .map((claim) => `PR #${claim.prNumber}`)
          .join(" and ")}. Resolve it before deploying.`,
        rivalCollisionClaims,
      );
    }

    const currentClaim = targetClaims[0];
    if (expectedRevision.source === "pr") {
      if (
        !currentClaim ||
        currentClaim.prNumber !== expectedRevision.prNumber ||
        currentClaim.branch !== expectedRevision.branch
      ) {
        return conflictResult(
          "review-changed",
          `PR #${expectedRevision.prNumber} is no longer the active review for this page. Your draft is safe; refresh before deploying.`,
          targetClaims,
        );
      }
      const block = reviewBlockForClaims(targetClaims);
      if (block) {
        return conflictResult(
          "non-editable-review",
          block.message,
          targetClaims,
        );
      }
      if (currentClaim.headSha !== expectedRevision.headSha) {
        return conflictResult(
          "stale-revision",
          `PR #${currentClaim.prNumber} changed after you opened this page. Your draft is safe; review the latest changes and reload before deploying.`,
          targetClaims,
        );
      }
      const currentPage = await getContents(
        token,
        targetPath,
        currentClaim.headSha,
      );
      if (!currentPage.ok) {
        return conflictResult(
          "review-changed",
          `The page is no longer available on PR #${currentClaim.prNumber}. Your draft is safe; refresh before deploying.`,
          targetClaims,
        );
      }
      const currentJson = (await currentPage.json()) as {
        sha: string;
        content?: string;
      };
      if (currentJson.sha !== expectedRevision.sha) {
        return conflictResult(
          "stale-revision",
          `PR #${currentClaim.prNumber} changed after you opened this page. Your draft is safe; review the latest changes and reload before deploying.`,
          targetClaims,
        );
      }
      currentCategory = categoryFromEncodedPage(currentJson.content);
    } else if (currentClaim) {
      const block = reviewBlockForClaims(targetClaims);
      if (block) {
        return conflictResult(
          "non-editable-review",
          block.message,
          targetClaims,
        );
      }
      return conflictResult(
        "review-changed",
        `PR #${currentClaim.prNumber} began changing this page after you opened it. Your draft is safe; reload to continue in that PR.`,
        targetClaims,
      );
    }

    if (expectedRevision.source === "base") {
      const currentBase = await getContents(token, targetPath, baseBranch);
      if (!currentBase.ok) {
        return conflictResult(
          "review-changed",
          "This page is no longer on the base branch. Your draft is safe; refresh before deploying.",
        );
      }
      const currentJson = (await currentBase.json()) as {
        sha: string;
        content?: string;
      };
      if (currentJson.sha !== expectedRevision.sha) {
        return conflictResult(
          "stale-revision",
          `This page changed on ${baseBranch} after you opened it. Your draft is safe; reload before deploying.`,
        );
      }
      currentCategory = categoryFromEncodedPage(currentJson.content);
    }

    if (expectedRevision.source !== "absent" && equivalentPath) {
      const equivalentBase = await getContents(
        token,
        equivalentPath,
        baseBranch,
      );
      if (equivalentBase.status === 200) {
        return conflictResult(
          "path-exists",
          `Another page already owns this URL at ${equivalentPath}. Resolve the duplicate before deploying.`,
        );
      }
      if (equivalentBase.status !== 404) {
        throw await ghError("Failed to check the page URL", equivalentBase);
      }
    }

    if (expectedRevision.source === "absent") {
      if (targetClaims.length > 0 || collisionClaims.length > 0) {
        const claims = [...targetClaims, ...collisionClaims];
        return conflictResult(
          "path-exists",
          `A page at this URL is already in review in PR #${claims[0].prNumber}. Open that page from the list instead.`,
          claims,
        );
      }
      for (const path of [targetPath, equivalentPath].filter(
        (path): path is string => Boolean(path),
      )) {
        const current = await getContents(token, path, baseBranch);
        if (current.status === 200) {
          return conflictResult(
            "path-exists",
            `A page already exists at ${path}. Open it from the list instead.`,
          );
        }
        if (current.status !== 404) {
          throw await ghError("Failed to check the page path", current);
        }
      }
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
      allowCategories: [newCategory?.slug, currentCategory].filter(
        (category): category is string => Boolean(category),
      ),
    });
    const leaf = targetPath.slice(CONTENT_ROOT.length);

    if (expectedRevision.source === "pr" && currentClaim) {
      return pushToExistingPR(
        token,
        currentClaim,
        targetPath,
        markdown,
        newCategory,
        data.prDescription,
        context.session.login,
      );
    }

    // Dot-free branch name: the Amplify preview cert is single-label (see
    // CLAUDE.md "Never put a `.` in a branch name").
    const branch = `start-page-${branchSlugFromPath(targetPath)}-${Date.now()}`;
    await createBranchFrom(token, baseBranch, branch);
    let openingPullRequest = false;

    try {
      // Re-check URL ownership on the just-created branch. It starts at the
      // latest base tip, which may have moved after preflight. Create mode
      // checks the requested file too; update mode relies on its conditional
      // blob sha for that path.
      const branchCollisionPaths =
        expectedRevision.source === "absent"
          ? [targetPath, equivalentPath]
          : [equivalentPath];
      for (const path of branchCollisionPaths.filter((path): path is string =>
        Boolean(path),
      )) {
        const checkRes = await getContents(token, path, branch);
        if (checkRes.status === 200) {
          throw new Error(
            `A page already exists at ${path}. Open it to edit instead.`,
          );
        }
        if (checkRes.status !== 404) {
          throw await ghError("Failed to check existing page", checkRes);
        }
      }

      if (newCategory) {
        await addCategoryOnBranch(token, branch, newCategory);
      }

      const putRes = await putFile(token, {
        path: targetPath,
        message: `${isUpdate ? "Update" : "Add"} landing page ${leaf}`,
        content: markdown,
        branch,
        sha:
          expectedRevision.source === "base" ? expectedRevision.sha : undefined,
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

      const prOptions = {
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
      };
      openingPullRequest = true;
      const pr = await openPullRequest(token, prOptions);
      return {
        status: "success",
        ...pr,
        path: targetPath,
        updatedExistingPR: false,
      };
    } catch (err) {
      // Once the PR request starts, a lost/5xx response cannot tell us whether
      // GitHub created it. Preserve the recoverable branch instead of deleting
      // the head from a PR that may already exist. Earlier failures are known
      // to be pre-PR and can be cleaned up safely.
      if (!openingPullRequest) await deleteBranch(branch, token);
      throw err;
    }
  });

/** Open a PR that removes a content page (the deploy-flow counterpart to delete). */
export const deleteContentPage = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      path: z.string(),
      title: z.string().default(""),
      expectedRevision: contentRevisionSchema,
    }),
  )
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

      const snapshot = await fetchOpenContentPRs(token, baseBranch);
      if (!snapshot.complete) {
        throw new Error(
          "Review status couldn’t be checked. Refresh and try again; no removal PR was created.",
        );
      }
      const claims = claimsForPath(snapshot, data.path);
      if (claims.length > 0) {
        throw new Error(
          `PR ${claims.map((claim) => `#${claim.prNumber}`).join(" and ")} already changes this page. Resolve it in GitHub before removing the page.`,
        );
      }
      if (data.expectedRevision.source !== "base") {
        throw new Error(
          "Only the current base-branch page can be removed. Refresh before trying again.",
        );
      }
      const currentBase = await getContents(token, data.path, baseBranch);
      if (!currentBase.ok) {
        throw new Error(
          "This page is no longer available on the base branch. Refresh before trying again.",
        );
      }
      const currentJson = (await currentBase.json()) as { sha: string };
      if (currentJson.sha !== data.expectedRevision.sha) {
        throw new Error(
          `This page changed on ${baseBranch}. Refresh before removing it.`,
        );
      }

      const branch = `start-page-${branchSlugFromPath(data.path)}-${Date.now()}`;
      await createBranchFrom(token, baseBranch, branch);
      let openingPullRequest = false;

      try {
        // The Contents DELETE needs the file's current blob sha on the branch.
        const getRes = await getContents(token, data.path, branch);
        if (getRes.status === 404) {
          throw new Error(`No page found at ${data.path} — nothing to remove.`);
        }
        if (!getRes.ok) throw await ghError("Failed to read page", getRes);
        const sha = ((await getRes.json()) as { sha: string }).sha;
        if (sha !== data.expectedRevision.sha) {
          throw new Error(
            `This page changed on ${baseBranch}. Refresh before removing it.`,
          );
        }

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

        const prOptions = {
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
            CONTENT_PR_MARKER,
          ].join("\n"),
        };
        openingPullRequest = true;
        const pr = await openPullRequest(token, prOptions);
        return { ...pr, path: data.path };
      } catch (err) {
        if (!openingPullRequest) await deleteBranch(branch, token);
        throw err;
      }
    },
  );
