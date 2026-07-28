import { REPO_NAME, repoOwner } from "./github-repo";

const API_BASE = "https://api.github.com";

// Colocated with the API form-definitions module so the API loader, the dump
// script, the Dockerfile, the publish flow, and this read path all share one
// canonical location. See plan/issue #145.
export const RECIPES_BASE = "apps/api/src/forms/form-definitions/recipes";

interface ContentsListEntry {
  name: string;
  type: "file" | "dir" | "submodule" | "symlink";
}

interface ContentsFile {
  name: string;
  encoding: string;
  content: string | null;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "gov-bb-form-builder",
  };
}

async function ghGet(
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** Fetch a form's canonical published recipe (#1196: the flat `{formId}.json`). */
export async function getPublishedRecipe(
  token: string,
  args: { formId: string },
): Promise<Record<string, unknown>> {
  return fetchRecipeFile(token, args.formId);
}

/**
 * List the on-disk recipe version names (no `.json` suffix) for a form. When
 * `ref` is given the listing is read off that branch/ref; otherwise GitHub
 * serves the repo's default branch. Returns `[]` when the folder is absent.
 */
export async function listVersions(
  token: string,
  formId: string,
  ref?: string,
): Promise<string[]> {
  const res = await ghGet(
    `${API_BASE}/repos/${repoOwner()}/${REPO_NAME}/contents/${RECIPES_BASE}/${encodeURIComponent(formId)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
    token,
  );
  if (res.status === 404) return [];
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `GitHub Contents API returned ${res.status} for ${RECIPES_BASE}/${formId}: ${JSON.stringify(res.body)}`,
    );
  }
  if (!Array.isArray(res.body)) {
    throw new Error(
      `Expected ${RECIPES_BASE}/${formId} to be a directory listing, got a non-array response`,
    );
  }
  const entries = res.body as ContentsListEntry[];
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".json"))
    .map((e) => e.name.replace(/\.json$/, ""));
}

async function fetchRecipeFile(
  token: string,
  formId: string,
): Promise<Record<string, unknown>> {
  const res = await ghGet(
    `${API_BASE}/repos/${repoOwner()}/${REPO_NAME}/contents/${RECIPES_BASE}/${encodeURIComponent(formId)}.json`,
    token,
  );
  if (res.status === 404) {
    throw new Error(`Recipe not found: ${RECIPES_BASE}/${formId}.json`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `GitHub Contents API returned ${res.status} for ${formId}.json: ${JSON.stringify(res.body)}`,
    );
  }
  const file = res.body as ContentsFile;
  if (file.encoding !== "base64") {
    throw new Error(
      `Unexpected encoding "${file.encoding}" for ${formId}.json — expected "base64"`,
    );
  }
  if (!file.content) {
    throw new Error(
      `Recipe ${formId}.json has no inline content — file may exceed 1MB`,
    );
  }
  const decoded = Buffer.from(file.content, "base64").toString("utf8");
  return JSON.parse(decoded) as Record<string, unknown>;
}
