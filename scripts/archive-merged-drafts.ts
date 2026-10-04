#!/usr/bin/env node
/**
 * On push to `main`, archive builder drafts for recipes that were just added.
 *
 * Inputs (env vars set by the workflow):
 *   - GITHUB_EVENT_PATH: path to the push event payload JSON.
 *   - API_URL:           base URL of the API, from the ARCHIVE_DRAFTS_API_URL
 *                        repo secret (the environment whose DB holds the drafts).
 *   - ARCHIVE_DRAFTS_TOKEN: bearer token for the admin endpoint.
 *
 * Behavior:
 *   - Runs `git diff --name-only --diff-filter=AM <before> <after>`.
 *   - Filters to the flat `…/recipes/{formId}.json` canonical files (#1196).
 *     Re-publishing a form *modifies* its flat file rather than adding a new
 *     versioned one, so we match both Added and Modified (AM).
 *   - Skips a modified recipe whose content did not change — only its
 *     `updatedAt` moved (#2878: the stamp backfill, a page-only service
 *     publication). "Content" is recipe-content.ts's definition, shared with
 *     the updatedAt guard. An added recipe, or a blob that does not parse, is
 *     archived as before.
 *   - POSTs to /admin/drafts/{formId}/archive for each.
 *   - 204 / 404 = success. Any other status, or a failed request, is logged,
 *     the remaining forms are still attempted, and the run then exits 1.
 *
 * Best-effort by design: spec says archival must not block PR merge. So when a
 * required secret is absent (e.g. ARCHIVE_DRAFTS_API_URL not provisioned) the
 * run *skips* with a loud warning rather than failing the workflow red — a
 * missing infra secret is an ops gap, not a per-push error (#2350).
 *
 * Once the secrets are set, a draft the API did not archive fails the run
 * (#2304). It runs after the merge, so red blocks nothing.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { sameRecipeContent } from "./recipe-content";

// Recipes are colocated with the API module. `git diff` yields repo-root-relative
// paths, so match the full path (not a bare `recipes/` prefix, which never
// matched and left this archival a silent no-op).
const RECIPES_DIR = "apps/api/src/forms/form-definitions/recipes";
const RECIPE_PATH_PATTERN =
  /(?:^|\/)apps\/api\/src\/forms\/form-definitions\/recipes\/([a-z0-9][a-z0-9-]*)\.json$/;

export function parseAddedRecipePaths(paths: string[]): { formId: string }[] {
  const out: { formId: string }[] = [];
  for (const p of paths) {
    const m = RECIPE_PATH_PATTERN.exec(p.trim());
    if (m) out.push({ formId: m[1] });
  }
  return out;
}

export interface SelectDraftsDeps {
  /** The push's before/after SHAs. */
  before: string;
  after: string;
  /** `git show <sha>:<path>`, or null when that revision has no such file. */
  readBlob: (sha: string, path: string) => string | null;
  log: (msg: string) => void;
}

/**
 * Drop the recipes whose change only moved `updatedAt` (#2878): a draft
 * expires on publish because the published content supersedes it, and a
 * stamp-only commit — the backfill, a page-only service publication —
 * published nothing new. A recipe the `before` revision does not have was
 * added, and a blob that does not parse cannot be judged; both are archived
 * as before. Pure apart from the injected reads.
 */
export function selectDraftsToArchive(
  entries: { formId: string }[],
  { before, after, readBlob, log }: SelectDraftsDeps,
): { formId: string }[] {
  return entries.filter(({ formId }) => {
    const path = `${RECIPES_DIR}/${formId}.json`;
    const prev = readBlob(before, path);
    if (prev === null) return true;
    const next = readBlob(after, path);
    if (next === null) return true;
    if (!sameRecipeContent(prev, next)) return true;
    log(`SKIP ${formId} — only updatedAt moved; the draft is kept`);
    return false;
  });
}

export interface ArchiveDriverDeps {
  apiUrl: string;
  token: string;
  fetch: typeof fetch;
  log: (msg: string) => void;
}

/** A draft the API did not archive, and the status or error that said so. */
export interface ArchiveFailure {
  formId: string;
  reason: string;
}

/**
 * Never throws and never stops early: every entry is attempted, and the ones
 * the API did not archive are returned so the caller decides what to do.
 */
export async function archiveDrafts(
  entries: { formId: string }[],
  { apiUrl, token, fetch: fetchFn, log }: ArchiveDriverDeps,
): Promise<ArchiveFailure[]> {
  const failures: ArchiveFailure[] = [];
  for (const { formId } of entries) {
    const url = `${apiUrl.replace(/\/+$/, "")}/admin/drafts/${formId}/archive`;
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (res.status === 204 || res.status === 404) {
        log(`OK [${res.status}] ${formId}`);
      } else {
        log(
          `WARN [${res.status}] ${formId} — draft not archived; clean up manually`,
        );
        failures.push({ formId, reason: `HTTP ${res.status}` });
      }
    } catch (err) {
      const message = (err as Error).message;
      log(`WARN ${formId} — request failed: ${message}`);
      failures.push({ formId, reason: `request failed: ${message}` });
    }
  }
  return failures;
}

/**
 * Fail the job loudly when any draft was left behind. This workflow runs on
 * push to `main`, after the merge, so a red run blocks nothing. What it must
 * not do is pass green while archiving nothing: a wrong host, a rejected token
 * (401) or an API with no token configured (500) all looked like success
 * before (#2304), and a draft left live is what #2409 published over a
 * committed recipe.
 */
function emitArchiveFailures(failures: ArchiveFailure[]): void {
  for (const { formId, reason } of failures) {
    console.log(
      `::error title=Draft not archived::${formId}: ${reason}. Archive it by hand.`,
    );
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const rows = failures
      .map(({ formId, reason }) => `| ${formId} | ${reason} |`)
      .join("\n");
    try {
      fs.appendFileSync(
        summaryPath,
        `### Archive merged drafts: ${failures.length} not archived\n\n| Form | Reason |\n| --- | --- |\n${rows}\n`,
      );
    } catch {
      // Non-fatal: the ::error:: annotations above are the primary signal.
    }
  }
}

/** Resolved secret-backed config, or a reason the run should skip. */
export type ArchiveConfig =
  | { apiUrl: string; token: string }
  | { skip: string };

/**
 * Resolve the two secret-backed inputs from the environment. A missing (or
 * empty) value returns a `skip` reason that names the **repo secret** the
 * maintainer must set — `ARCHIVE_DRAFTS_API_URL` / `ARCHIVE_DRAFTS_TOKEN` — not
 * the internal `API_URL` env var, so the workflow warning is actionable. Pure:
 * no I/O, no process side-effects, so both branches are unit-testable.
 */
export function resolveArchiveConfig(env: NodeJS.ProcessEnv): ArchiveConfig {
  const apiUrl = env.API_URL;
  const token = env.ARCHIVE_DRAFTS_TOKEN;
  if (!apiUrl) return { skip: "ARCHIVE_DRAFTS_API_URL secret is not set" };
  if (!token) return { skip: "ARCHIVE_DRAFTS_TOKEN secret is not set" };
  return { apiUrl, token };
}

/**
 * Surface a skip loudly without failing the job: a GitHub `::warning::`
 * annotation (shows on the run and in the log) plus a step-summary section when
 * one is available. The reason names the secret only — never a secret value.
 */
function emitSkipWarning(reason: string): void {
  console.log(`::warning::archive-merged-drafts skipped — ${reason}`);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      fs.appendFileSync(
        summaryPath,
        `### Archive merged drafts: skipped\n\n${reason}. No drafts were archived.\n`,
      );
    } catch {
      // Non-fatal — the ::warning:: annotation above is the primary signal.
    }
  }
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    console.error(
      "GITHUB_EVENT_PATH is not set; not running inside a workflow?",
    );
    process.exit(1);
  }

  // A missing infra secret is an ops gap, not a per-push error: skip loudly
  // (exit 0) rather than fail the workflow red on every recipe push (#2350).
  const config = resolveArchiveConfig(process.env);
  if ("skip" in config) {
    emitSkipWarning(config.skip);
    return;
  }
  const { apiUrl, token } = config;

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8")) as {
    before?: string;
    after?: string;
    forced?: boolean;
  };
  const before = event.before;
  const after = event.after;
  if (!before || !after) {
    console.error("Push event lacks before/after SHAs; nothing to do.");
    return;
  }
  // First push to a branch reports before === all-zeros; nothing to diff.
  if (/^0+$/.test(before)) {
    console.log("Initial push (no `before` SHA); skipping archival.");
    return;
  }

  let raw = "";
  try {
    raw = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=AM", before, after],
      { encoding: "utf8" },
    );
  } catch (err) {
    console.error(`git diff failed: ${(err as Error).message}`);
    process.exit(1);
  }
  const paths = raw.split("\n").filter(Boolean);
  const entries = selectDraftsToArchive(parseAddedRecipePaths(paths), {
    before,
    after,
    readBlob: (sha, path) => {
      try {
        return execFileSync("git", ["show", `${sha}:${path}`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        return null;
      }
    },
    log: console.log,
  });
  if (entries.length === 0) {
    console.log("No recipe files with changed content; nothing to archive.");
    return;
  }
  console.log(`Found ${entries.length} changed recipe file(s) to archive.`);

  const failures = await archiveDrafts(entries, {
    apiUrl,
    token,
    fetch: globalThis.fetch,
    log: console.log,
  });
  if (failures.length > 0) {
    emitArchiveFailures(failures);
    process.exit(1);
  }
}

// Only run main() when executed directly, not when imported by tests.
// Root package.json has no `"type": "module"`, so this file runs as CJS
// under tsx (and vitest) — `require.main === module` works.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
