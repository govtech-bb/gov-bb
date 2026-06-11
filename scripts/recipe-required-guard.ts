#!/usr/bin/env node
// scripts/recipe-required-guard.ts
/**
 * PR gate for #429: every `components/generic-*` field that a PR ADDS or
 * MODIFIES in a recipe must declare `validations.required.value` explicitly
 * (`true` or `false`).
 *
 * Why: the generic primitives in packages/registry all ship a baked-in
 * `validations.required = { value: true, error: "This field is required" }`,
 * and recipe overrides merge shallowly (`shallowMergeDefined` in
 * apps/api/src/registry/resolution.ts and packages/form-builder/src/resolution.ts).
 * An override that omits `validations.required` therefore silently inherits
 * `required: true` and renders the generic error on an empty, optional-looking
 * field — the unsafe behaviour is the default. This guard makes the choice
 * deliberate going forward without flipping the registry default or migrating
 * the existing corpus.
 *
 * Scope / grandfathering:
 *   - Diff-scoped: only recipe files in the PR diff are inspected.
 *   - Per-changed-field: a generic field is in scope only if it was ADDED or
 *     its serialized override CHANGED between the PR base and head (identity =
 *     stepId + fieldId). Unchanged fields — the ~433 existing implicitly-required
 *     instances — are never flagged, so this is purely additive.
 *   - Only direct `components/generic-*` refs. `blocks/*`-nested generics and
 *     non-generic primitives (name, email, address, …) are out of scope.
 *
 * Escape hatch: the `recipe-required-override` label on the PR skips the guard
 * (labels are read live from the API, so "add the label + re-run the failed
 * check" works without pushing a new commit). Mirrors `recipe-version-override`.
 *
 * Inputs (env, set by the workflow):
 *   - GITHUB_EVENT_PATH: pull_request event payload JSON.
 *   - GITHUB_TOKEN:      token with contents:read + pull-requests:read.
 *   - GITHUB_REPOSITORY: owner/repo.
 */
import * as fs from "node:fs";

export const RECIPE_PATH_PATTERN =
  /^apps\/api\/src\/forms\/form-definitions\/recipes\/([a-z0-9][a-z0-9-]*)\/([0-9]+\.[0-9]+\.[0-9]+)\.json$/;

export const OVERRIDE_LABEL = "recipe-required-override";

const GENERIC_REF_PREFIX = "components/generic-";

// ---------------------------------------------------------------------------
// Pure rule (unit-tested)
// ---------------------------------------------------------------------------

// Loosely-typed views of the recipe JSON: the guard only reads a few fields and
// must stay robust to anything the schema permits, so it deliberately avoids the
// full zod types.
export interface RequiredRuleLike {
  value?: unknown;
}
export interface ValidationsLike {
  required?: RequiredRuleLike;
  [key: string]: unknown;
}
export interface OverridesLike {
  fieldId?: string;
  validations?: ValidationsLike;
  [key: string]: unknown;
}
export interface ElementLike {
  ref?: string;
  overrides?: OverridesLike;
}
export interface StepLike {
  stepId?: string;
  elements?: ElementLike[];
}
export interface RecipeLike {
  steps?: StepLike[];
}

export interface RecipeFileChange {
  path: string;
  // Parsed base-ref content of the file, or null when the PR newly ADDS it
  // (every generic field is then "added" and in scope).
  baseJson: RecipeLike | null;
  headJson: RecipeLike;
}

const isGenericRef = (ref: string | undefined): boolean =>
  typeof ref === "string" && ref.startsWith(GENERIC_REF_PREFIX);

const hasExplicitRequired = (el: ElementLike): boolean =>
  typeof el.overrides?.validations?.required?.value === "boolean";

// Field identity within a step. Generic fields almost always carry an explicit
// fieldId; fall back to positional identity so a field without one is still
// tracked (a positional shift then reads as "changed", which fails safe).
const fieldKey = (el: ElementLike, index: number): string =>
  el.overrides?.fieldId ?? `#${index}`;

/** stepId → (fieldKey → serialized element) for the base recipe.
 *
 * Assumes fieldId is unique within a step (the schema's kebab fieldIds make a
 * collision schema-invalid). On the rare duplicate, the last element wins and an
 * earlier one may read as "changed" — fail-safe: the worst case is the guard
 * asking for an explicit `required`, which is exactly its intent. */
function indexBase(base: RecipeLike | null): Map<string, Map<string, string>> {
  const byStep = new Map<string, Map<string, string>>();
  for (const step of base?.steps ?? []) {
    const byField = new Map<string, string>();
    (step.elements ?? []).forEach((el, i) => {
      byField.set(fieldKey(el, i), JSON.stringify(el));
    });
    byStep.set(step.stepId ?? "", byField);
  }
  return byStep;
}

export function findRequiredGuardViolations(args: {
  recipeFiles: RecipeFileChange[];
  hasOverrideLabel: boolean;
}): string[] {
  const { recipeFiles, hasOverrideLabel } = args;
  if (hasOverrideLabel) return [];

  const violations: string[] = [];
  for (const file of recipeFiles) {
    const baseIndex = indexBase(file.baseJson);
    for (const step of file.headJson.steps ?? []) {
      const stepId = step.stepId ?? "";
      const baseFields = baseIndex.get(stepId);
      (step.elements ?? []).forEach((el, i) => {
        if (!isGenericRef(el.ref)) return;
        const key = fieldKey(el, i);
        const baseSerialized = baseFields?.get(key);
        // Unchanged (identical serialized override at the same stepId+fieldId)
        // ⇒ grandfathered, never flagged.
        if (
          baseSerialized !== undefined &&
          baseSerialized === JSON.stringify(el)
        )
          return;
        if (!hasExplicitRequired(el)) {
          violations.push(
            `${file.path}: step "${stepId}" field "${key}" (${el.ref}) must declare ` +
              `validations.required.value explicitly (true or false). Generic primitives ` +
              `default to required, so an omitted required silently blocks submission. ` +
              `Add the "${OVERRIDE_LABEL}" label to bypass.`,
          );
        }
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export interface ChangedFile {
  filename: string;
  status: string; // "added" | "modified" | "removed" | "renamed" | "changed" | "copied" | "unchanged" | ...
  previous_filename?: string;
}

const isRecipePath = (p: string): boolean => RECIPE_PATH_PATTERN.test(p);

/** The base-ref path to read for a changed file, or null when there is none. */
function basePathFor(f: ChangedFile): string | null {
  if (f.status === "added") return null;
  if (
    (f.status === "renamed" || f.status === "copied") &&
    f.previous_filename
  ) {
    return isRecipePath(f.previous_filename) ? f.previous_filename : null;
  }
  return f.filename;
}

const GH_API = "https://api.github.com";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok)
    throw new Error(
      `GitHub API ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`,
    );
  return (await res.json()) as T;
}

/** Paginate a GitHub list endpoint (100/page, hard cap 10 pages — logged if hit). */
async function ghPaged<T>(
  base: string,
  token: string,
  log: (m: string) => void,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 10; page++) {
    const sep = base.includes("?") ? "&" : "?";
    const batch = await ghJson<T[]>(
      `${base}${sep}per_page=100&page=${page}`,
      token,
    );
    out.push(...batch);
    if (batch.length < 100) return out;
  }
  log(
    `WARN: pagination cap (1000 items) hit for ${base} — results may be incomplete.`,
  );
  return out;
}

/** Fetch a file's UTF-8 content at a ref via the contents API; null on 404. */
async function ghContent(
  repo: string,
  filePath: string,
  ref: string,
  token: string,
): Promise<string | null> {
  const url = `${GH_API}/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(
      `GitHub API ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`,
    );
  const json = (await res.json()) as { content?: string; encoding?: string };
  if (json.encoding !== "base64" || typeof json.content !== "string")
    throw new Error(`Unexpected contents response for ${filePath}@${ref}`);
  return Buffer.from(json.content, "base64").toString("utf8");
}

function parseRecipe(raw: string, filePath: string): RecipeLike {
  try {
    return JSON.parse(raw) as RecipeLike;
  } catch (err) {
    // Re-throw the original error (preserving its stack) with the file path
    // prepended for context — wrapping in a new Error would drop the original
    // and `Error.cause` isn't in this script's TS lib target.
    if (err instanceof Error)
      err.message = `Failed to parse recipe ${filePath}: ${err.message}`;
    throw err;
  }
}

async function main(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  if (!eventPath || !token || !repo) {
    console.error(
      "GITHUB_EVENT_PATH, GITHUB_TOKEN and GITHUB_REPOSITORY are required.",
    );
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8")) as {
    number?: number;
  };
  const prNumber = event.number;
  if (!prNumber) {
    console.error("Not a pull_request event payload; nothing to check.");
    process.exit(1);
  }

  // PR object: labels (read LIVE, not from the event payload — the workflow
  // doesn't retrigger on `labeled`, so the override path is "add the label,
  // then re-run the failed check") plus the base/head SHAs for content diffs.
  const pr = await ghJson<{
    labels?: { name: string }[];
    base?: { sha?: string };
    head?: { sha?: string };
  }>(`${GH_API}/repos/${repo}/pulls/${prNumber}`, token);

  const hasOverrideLabel = (pr.labels ?? []).some(
    (l) => l.name === OVERRIDE_LABEL,
  );
  if (hasOverrideLabel) {
    console.log(
      `"${OVERRIDE_LABEL}" label present — recipe required guard skipped.`,
    );
    return;
  }

  // base.sha is the base-branch tip, not the 3-dot merge base GitHub uses to
  // compute the file diff. If the base branch moved on since the PR forked, a
  // field could read as "modified" purely from an upstream edit. That is
  // fail-safe: the worst case is the guard asking for an explicit `required` on
  // a field the PR didn't really touch, and only ever on a recipe file this PR
  // already changed (the diff is the gate). Never a false negative.
  const baseSha = pr.base?.sha;
  const headSha = pr.head?.sha;
  if (!baseSha || !headSha) {
    console.error("PR base/head SHA missing; cannot diff recipe content.");
    process.exit(1);
  }

  const changedFiles = await ghPaged<ChangedFile>(
    `${GH_API}/repos/${repo}/pulls/${prNumber}/files`,
    token,
    console.log,
  );

  // Only files present in head are checkable; "removed" has nothing to require
  // and "unchanged" (patch elided in very large PRs) is a no-op (base === head).
  const recipeChanges = changedFiles.filter(
    (f) =>
      isRecipePath(f.filename) &&
      f.status !== "removed" &&
      f.status !== "unchanged",
  );
  if (recipeChanges.length === 0) {
    console.log("No added/modified recipe files. OK.");
    return;
  }

  const recipeFiles: RecipeFileChange[] = [];
  for (const f of recipeChanges) {
    const headRaw = await ghContent(repo, f.filename, headSha, token);
    if (headRaw === null)
      throw new Error(
        `Could not read head content for ${f.filename}@${headSha}`,
      );
    const basePath = basePathFor(f);
    const baseRaw = basePath
      ? await ghContent(repo, basePath, baseSha, token)
      : null;
    recipeFiles.push({
      path: f.filename,
      headJson: parseRecipe(headRaw, f.filename),
      baseJson:
        baseRaw === null ? null : parseRecipe(baseRaw, basePath as string),
    });
  }

  const violations = findRequiredGuardViolations({
    recipeFiles,
    hasOverrideLabel: false,
  });
  if (violations.length > 0) {
    console.error(
      `Found ${violations.length} recipe required-field guard violation(s):`,
    );
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`Recipe required guard passed for PR #${prNumber}. OK.`);
}

// Only run main() when executed directly, not when imported by tests (CJS —
// same pattern as recipe-version-guard.ts).
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
