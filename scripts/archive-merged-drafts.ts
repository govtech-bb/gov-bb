#!/usr/bin/env node
/**
 * On push to `dev`, archive builder drafts for recipes that were just added.
 *
 * Inputs (env vars set by the workflow):
 *   - GITHUB_EVENT_PATH: path to the push event payload JSON.
 *   - API_URL:           base URL of the API (e.g. https://forms.api.dev.alpha.gov.bb)
 *   - ARCHIVE_DRAFTS_TOKEN: bearer token for the admin endpoint.
 *
 * Behavior:
 *   - Runs `git diff --name-only --diff-filter=AM <before> <after>`.
 *   - Filters to the flat `…/recipes/{formId}.json` canonical files (#1196).
 *     Re-publishing a form *modifies* its flat file rather than adding a new
 *     versioned one, so we match both Added and Modified (AM).
 *   - POSTs to /admin/drafts/{formId}/archive for each.
 *   - 204 / 404 = success. Other statuses logged but non-fatal.
 *
 * Best-effort by design: spec says archival must not block PR merge.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

// Recipes are colocated with the API module. `git diff` yields repo-root-relative
// paths, so match the full path (not a bare `recipes/` prefix, which never
// matched and left this archival a silent no-op).
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

export interface ArchiveDriverDeps {
  apiUrl: string;
  token: string;
  fetch: typeof fetch;
  log: (msg: string) => void;
}

export async function archiveDrafts(
  entries: { formId: string }[],
  { apiUrl, token, fetch: fetchFn, log }: ArchiveDriverDeps,
): Promise<void> {
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
      }
    } catch (err) {
      log(`WARN ${formId} — request failed: ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const apiUrl = process.env.API_URL;
  const token = process.env.ARCHIVE_DRAFTS_TOKEN;

  if (!eventPath) {
    console.error(
      "GITHUB_EVENT_PATH is not set; not running inside a workflow?",
    );
    process.exit(1);
  }
  if (!apiUrl) {
    console.error("API_URL is not set");
    process.exit(1);
  }
  if (!token) {
    console.error("ARCHIVE_DRAFTS_TOKEN is not set");
    process.exit(1);
  }

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
  const entries = parseAddedRecipePaths(paths);
  if (entries.length === 0) {
    console.log("No newly-added recipe files; nothing to archive.");
    return;
  }
  console.log(`Found ${entries.length} new recipe file(s) to archive.`);

  await archiveDrafts(entries, {
    apiUrl,
    token,
    fetch: globalThis.fetch,
    log: console.log,
  });
}

// Only run main() when executed directly, not when imported by tests.
// Root package.json has no `"type": "module"`, so this file runs as CJS
// under both ts-jest and tsx — `require.main === module` works.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
