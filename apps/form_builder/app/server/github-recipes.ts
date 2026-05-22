export const REPO_OWNER = "govtech-bb";
export const REPO_NAME = "gov-bb";

const API_BASE = "https://api.github.com";

export interface PublishedFormSummary {
  formId: string;
  title: string;
  version: string;
}

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

function parseSemver(v: string): number[] {
  return v.split(".").map((seg) => {
    const n = Number.parseInt(seg, 10);
    return Number.isFinite(n) ? n : -Infinity;
  });
}

function compareSemver(a: string, b: string): number {
  const aa = parseSemver(a);
  const bb = parseSemver(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function ghGet(
  url: string,
  token: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** List all published forms — one entry per formId, using the latest version's title. */
export async function listPublishedForms(
  token: string,
): Promise<PublishedFormSummary[]> {
  const top = await ghGet(
    `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipes`,
    token,
  );
  if (top.status === 404) return [];
  if (top.status < 200 || top.status >= 300) {
    throw new Error(
      `GitHub Contents API returned ${top.status} for recipes/: ${JSON.stringify(top.body)}`,
    );
  }
  if (!Array.isArray(top.body)) {
    throw new Error(
      `Expected recipes/ to be a directory listing, got a non-array response`,
    );
  }
  const entries = top.body as ContentsListEntry[];
  const formDirs = entries.filter((e) => e.type === "dir").map((e) => e.name);

  const result: PublishedFormSummary[] = [];
  for (const formId of formDirs) {
    const versions = await listVersions(token, formId);
    if (versions.length === 0) continue;
    const latest = versions.reduce((best, v) =>
      compareSemver(v, best) > 0 ? v : best,
    );
    const recipe = await fetchRecipeFile(token, formId, latest);
    result.push({
      formId,
      title: typeof recipe.title === "string" ? recipe.title : formId,
      version: latest,
    });
  }
  return result;
}

/** Fetch a single recipe by formId + optional version. Latest when version omitted. */
export async function getPublishedRecipe(
  token: string,
  args: { formId: string; version?: string },
): Promise<Record<string, unknown>> {
  let version = args.version;
  if (!version) {
    const versions = await listVersions(token, args.formId);
    if (versions.length === 0) {
      throw new Error(`No recipe found for formId "${args.formId}"`);
    }
    version = versions.reduce((best, v) =>
      compareSemver(v, best) > 0 ? v : best,
    );
  }
  return fetchRecipeFile(token, args.formId, version);
}

async function listVersions(token: string, formId: string): Promise<string[]> {
  const res = await ghGet(
    `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipes/${encodeURIComponent(formId)}`,
    token,
  );
  if (res.status === 404) return [];
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `GitHub Contents API returned ${res.status} for recipes/${formId}: ${JSON.stringify(res.body)}`,
    );
  }
  if (!Array.isArray(res.body)) {
    throw new Error(
      `Expected recipes/${formId} to be a directory listing, got a non-array response`,
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
  version: string,
): Promise<Record<string, unknown>> {
  const res = await ghGet(
    `${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/recipes/${encodeURIComponent(formId)}/${encodeURIComponent(version)}.json`,
    token,
  );
  if (res.status === 404) {
    throw new Error(`Recipe not found: recipes/${formId}/${version}.json`);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `GitHub Contents API returned ${res.status} for ${formId}/${version}.json: ${JSON.stringify(res.body)}`,
    );
  }
  const file = res.body as ContentsFile;
  if (file.encoding !== "base64") {
    throw new Error(
      `Unexpected encoding "${file.encoding}" for ${formId}/${version}.json — expected "base64"`,
    );
  }
  if (!file.content) {
    throw new Error(
      `Recipe ${formId}/${version}.json has no inline content — file may exceed 1MB`,
    );
  }
  const decoded = Buffer.from(file.content, "base64").toString("utf8");
  return JSON.parse(decoded) as Record<string, unknown>;
}
