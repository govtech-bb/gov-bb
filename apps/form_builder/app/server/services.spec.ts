import { createHash } from "node:crypto";
import matter from "gray-matter";
import {
  serviceReadiness,
  serviceSnapshotSchema,
  type ServiceSnapshot,
} from "@govtech-bb/form-types";
import { api } from "./api-client";
import { getContents, listOpenPRHeads, openPullRequest } from "./github";
import {
  checkpointFiles,
  loadServiceSource,
  publishServiceVersion,
  retainServiceVersion,
} from "./services";
import { resolveStoredRecipe, resolveCurrentRecipe } from "./forms";
import { loadLandingContentPage } from "./content";

vi.mock("./api-client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock("./github", () => ({
  repoUrl: (path: string) =>
    `https://api.github.test/repos/test/services${path}`,
  authHeaders: () => ({}),
  ghError: async (message: string) => new Error(message),
  getContents: vi.fn(),
  listOpenPRHeads: vi.fn(),
  openPullRequest: vi.fn(),
}));
vi.mock("./publish", () => ({
  resolveBaseBranch: () => "main",
  carryUnauthoredFields: (_old: unknown, recipe: unknown) => recipe,
  // The clock Deploy stamps `updatedAt` with (#2878); frozen here.
  recipeWriteStamp: () => STAMPED_AT,
}));
const STAMPED_AT = "2026-10-04T12:00:00.000Z";
vi.mock("./forms", () => ({
  resolveStoredRecipe: vi.fn(),
  resolveCurrentRecipe: vi.fn(),
}));
vi.mock("./content", () => ({ loadLandingContentPage: vi.fn() }));
vi.mock("./auth/require-session", () => ({ requireSession: {} }));

const id = "7aa1aeed-fcce-42b7-896a-3259a35bb5b8";
const main = "2f5c0b16-2c0f-4877-b611-69933c4df678";
const help = "5dcbf56a-f1de-4d7b-9261-e27320612f55";
const snapshot = serviceSnapshotSchema.parse({
  manifest: {
    schemaVersion: 1,
    serviceId: "test-service",
    title: "Test service",
    category: "health",
    formId: null,
    entryPoint: main,
    contactDetails: { email: "help@example.test" },
    pages: [
      {
        id: main,
        path: "apps/landing/src/content/test-service/index.md",
        title: "Main",
        publicPath: "/health/test-service",
        kind: "main",
      },
      {
        id: help,
        path: "apps/landing/src/content/test-service/help.md",
        title: "Help",
        publicPath: "/health/test-service/help",
        kind: "guidance",
      },
    ],
  },
  pages: [main, help].map((pageId, index) => ({
    id: pageId,
    path: `apps/landing/src/content/test-service/${index ? "help" : "index"}.md`,
    frontmatter: { title: index ? "Help" : "Main", visibility: "public" },
    body: index ? "Separate guidance" : "Original main page",
    baseSha: null,
  })),
  recipe: null,
  pendingConfig: {
    mdaContactId: "f4b47932-e4b2-48c5-85f3-981b1481aff9",
    processors: null,
  },
});
const detail = {
  id,
  serviceId: "test-service",
  revision: 3,
  label: "Ready to review",
  createdAt: "2026-09-10T00:00:00.000Z",
  createdBy: "editor",
  gitSha: null as string | null,
  gitRef: null as string | null,
  prNumber: null as number | null,
  prUrl: null as string | null,
  snapshot,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const invoke = (fn: unknown) =>
  (fn as (arg: unknown) => Promise<unknown>)({
    data: { id, label: detail.label, snapshot },
    context: { session: { login: "editor", accessToken: "test-token" } },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockImplementation(async (path) =>
    path.endsWith("/preflight") ? { ready: true, issues: [] } : detail,
  );
  vi.mocked(api.post).mockImplementation(async (_path, body) => ({
    ...detail,
    ...(body as object),
  }));
  vi.mocked(getContents).mockImplementation(async () => json({}, 404));
  vi.mocked(listOpenPRHeads).mockResolvedValue([]);
  vi.mocked(openPullRequest).mockResolvedValue({
    prNumber: 7,
    prUrl: "https://github.test/pull/7",
  });
});
afterEach(() => vi.unstubAllGlobals());

it("retains all pages in one immutable Git commit without private configuration", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/git/ref/tags/")) return json({}, 404);
    if (url.endsWith("/git/ref/heads/main"))
      return json({ object: { sha: "a".repeat(40) } });
    if (url.endsWith(`/git/commits/${"a".repeat(40)}`))
      return json({ tree: { sha: "base-tree" } });
    if (url.endsWith("/git/trees")) return json({ sha: "service-tree" });
    if (url.endsWith("/git/commits")) return json({ sha: "b".repeat(40) });
    if (url.endsWith("/git/refs")) return json({});
    throw new Error(`Unexpected request: ${init?.method} ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  await invoke(retainServiceVersion);
  const tree = JSON.parse(
    fetcher.mock.calls.find(([url]) => url.endsWith("/git/trees"))![1]!
      .body as string,
  );
  expect(tree.tree).toHaveLength(3);
  expect(tree.tree.map((file: { path: string }) => file.path)).toEqual(
    checkpointFiles(snapshot).map((f) => f.path),
  );
  expect(JSON.stringify(tree)).not.toContain(
    snapshot.pendingConfig.mdaContactId,
  );
  expect(tree.tree[1].content).toContain("Original main page");
  expect(tree.tree[2].content).toContain("Separate guidance");
  // The page keeps its own visibility; the manifest no longer carries one.
  expect(tree.tree[1].content).toContain("visibility: public");
  expect(JSON.parse(tree.tree[0].content)).not.toHaveProperty("visibility");
  expect(
    fetcher.mock.calls.filter(([url]) => url.endsWith("/git/commits")),
  ).toHaveLength(1);
  expect(
    JSON.parse(
      fetcher.mock.calls.find(([url]) => url.endsWith("/git/refs"))![1]!
        .body as string,
    ),
  ).toEqual({
    ref: `refs/tags/service-checkpoints/test-service/${id}`,
    sha: "b".repeat(40),
  });
});

it("reuses a matching retained tag and refuses a changed checkpoint", async () => {
  const fetcher = vi.fn(async () => json({ object: { sha: "b".repeat(40) } }));
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(getContents).mockImplementation(async (_token, path) => {
    const content = Buffer.from(
      checkpointFiles(snapshot).find((f) => f.path === path)!.content,
    );
    return json({
      sha: createHash("sha1")
        .update(`blob ${content.length}\0`)
        .update(content)
        .digest("hex"),
    });
  });
  await expect(invoke(retainServiceVersion)).resolves.toMatchObject({
    gitSha: "b".repeat(40),
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.mocked(api.post).mockClear();
  vi.mocked(getContents).mockImplementation(async () =>
    json({ sha: "changed" }),
  );
  await expect(invoke(retainServiceVersion)).rejects.toThrow("does not match");
  expect(api.post).not.toHaveBeenCalled();
});

// #2878: the services publication is a recipe write like builder Deploy. The
// committed `updatedAt` is what the builder compares a draft row against, so
// a publication that changed the recipe's content stamps it at the write —
// and one that did not (pages only) must leave the file untouched, or the
// next open would re-sync a draft row over the author's unsaved builder edits.
describe("recipe updatedAt on the services publish write (#2878)", () => {
  const recipe = {
    formId: "test-form",
    title: "Application",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };
  const withForm = serviceSnapshotSchema.parse({
    ...snapshot,
    manifest: { ...snapshot.manifest, formId: "test-form" },
    recipe,
  });
  const recipePath =
    "apps/api/src/forms/form-definitions/recipes/test-form.json";
  const BASE_SHA = "a".repeat(40);
  const TAG_SHA = "b".repeat(40);
  // The same content as `recipe`, as an earlier hand edit might have left it
  // on main: compact, keys in another order, an older stamp.
  const committedUnchanged = JSON.stringify({
    updatedAt: "2026-03-01T00:00:00.000Z",
    steps: [],
    title: "Application",
    createdAt: "2026-01-01T00:00:00.000Z",
    formId: "test-form",
  });
  const blobSha = (content: string) => {
    const buffer = Buffer.from(content);
    return createHash("sha1")
      .update(`blob ${buffer.length}\0`)
      .update(buffer)
      .digest("hex");
  };
  const contentsFile = (content: string) =>
    json({
      sha: blobSha(content),
      content: Buffer.from(content).toString("base64"),
    });
  // What the checkpoint would hold for a non-recipe path.
  const otherFile = (path: string) =>
    checkpointFiles(withForm).find((f) => f.path === path)!.content;
  const retain = () =>
    (retainServiceVersion as unknown as (arg: unknown) => Promise<unknown>)({
      data: { id, label: detail.label, snapshot: withForm },
      context: { session: { login: "editor", accessToken: "test-token" } },
    });
  // The create path: no tag yet, then tree → commit → ref.
  const createFetcher = () =>
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/git/ref/tags/")) return json({}, 404);
      if (url.endsWith("/git/ref/heads/main"))
        return json({ object: { sha: BASE_SHA } });
      if (url.endsWith(`/git/commits/${BASE_SHA}`))
        return json({ tree: { sha: "base-tree" } });
      if (url.endsWith("/git/trees")) return json({ sha: "service-tree" });
      if (url.endsWith("/git/commits")) return json({ sha: TAG_SHA });
      if (url.endsWith("/git/refs")) return json({});
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });
  const writtenRecipe = (fetcher: ReturnType<typeof createFetcher>) =>
    JSON.parse(
      fetcher.mock.calls.find(([url]) => url.endsWith("/git/trees"))![1]!
        .body as string,
    ).tree.find((file: { path: string }) => file.path === recipePath)
      .content as string;
  // The tag exists; every file reads from it as given.
  const existingTag = (
    saved: (path: string) => Response | Promise<Response>,
  ) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ object: { sha: TAG_SHA } })),
    );
    vi.mocked(getContents).mockImplementation(async (_token, path, ref) =>
      ref === TAG_SHA ? saved(path) : json({}, 404),
    );
  };

  it("writes the committed recipe untouched when only pages changed", async () => {
    vi.mocked(getContents).mockImplementation(async (_token, path, ref) =>
      path === recipePath && ref === BASE_SHA
        ? contentsFile(committedUnchanged)
        : json({}, 404),
    );
    const fetcher = createFetcher();
    vi.stubGlobal("fetch", fetcher);

    await retain();

    // Byte-identical to main, so the publication does not touch the file and
    // no stamp moves.
    expect(writtenRecipe(fetcher)).toBe(committedUnchanged);
  });

  it("stamps updatedAt when the recipe's content changed against the committed copy", async () => {
    vi.mocked(getContents).mockImplementation(async (_token, path, ref) =>
      path === recipePath && ref === BASE_SHA
        ? contentsFile(
            JSON.stringify({ ...recipe, title: "Older application" }),
          )
        : json({}, 404),
    );
    const fetcher = createFetcher();
    vi.stubGlobal("fetch", fetcher);

    await retain();

    expect(JSON.parse(writtenRecipe(fetcher))).toMatchObject({
      title: "Application",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: STAMPED_AT,
    });
  });

  it("stamps updatedAt on a first publication, with nothing committed yet", async () => {
    const fetcher = createFetcher();
    vi.stubGlobal("fetch", fetcher);

    await retain();

    expect(JSON.parse(writtenRecipe(fetcher)).updatedAt).toBe(STAMPED_AT);
  });

  it("reports a failed read of the committed recipe rather than treating it as a change", async () => {
    vi.mocked(getContents).mockImplementation(async (_token, path, ref) =>
      path === recipePath && ref === BASE_SHA
        ? json({ message: "boom" }, 502)
        : json({}, 404),
    );
    vi.stubGlobal("fetch", createFetcher());

    await expect(retain()).rejects.toThrow(/could not read/i);
  });

  it("matches a saved version by recipe content, whatever stamp it was written with, so publishing it later still works", async () => {
    existingTag((path) =>
      contentsFile(
        path === recipePath
          ? JSON.stringify({ ...recipe, updatedAt: "2026-09-30T08:15:00.000Z" })
          : otherFile(path),
      ),
    );

    await expect(retain()).resolves.toMatchObject({ gitSha: TAG_SHA });
    // Only the tag ref was read: no new tree, commit or ref was written.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("matches a saved version whose recipe carries no updatedAt when the content is equal", async () => {
    const { updatedAt: _stamp, ...unstamped } = recipe;
    existingTag((path) =>
      contentsFile(
        path === recipePath ? JSON.stringify(unstamped) : otherFile(path),
      ),
    );

    await expect(retain()).resolves.toMatchObject({ gitSha: TAG_SHA });
  });

  it("still refuses a saved version whose recipe content differs", async () => {
    existingTag((path) =>
      contentsFile(
        path === recipePath
          ? JSON.stringify({ ...recipe, title: "Different application" })
          : otherFile(path),
      ),
    );

    await expect(retain()).rejects.toThrow("does not match");
  });

  it("reports a transient GitHub failure reading the saved version as such, not as a mismatch", async () => {
    existingTag((path) =>
      path === recipePath
        ? contentsFile(JSON.stringify(recipe))
        : json({ message: "rate limited" }, 503),
    );

    const error = (await retain().catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/could not read/i);
    expect(error.message).not.toContain("does not match");
  });
});

it("publishes the recipe's own status and each page's own visibility (#2683)", () => {
  const withForm = serviceSnapshotSchema.parse({
    ...snapshot,
    manifest: { ...snapshot.manifest, formId: "test-form" },
    recipe: {
      formId: "test-form",
      title: "Application",
      steps: [],
      meta: { visibility: "maintenance" },
    },
  });
  const files = checkpointFiles(withForm);
  expect(JSON.parse(files[0].content)).not.toHaveProperty("visibility");
  expect(matter(files[1].content).data.visibility).toBe("public");
  expect(JSON.parse(files[3].content).meta).toEqual({
    visibility: "maintenance",
  });
});

it("refuses publication when the source revision changes", async () => {
  vi.mocked(getContents).mockImplementation(async () =>
    json({ sha: "changed" }),
  );
  await expect(invoke(publishServiceVersion)).rejects.toThrow("changed");
  expect(openPullRequest).not.toHaveBeenCalled();
});

it("adopts a service even when its form cannot be fetched", async () => {
  vi.mocked(resolveCurrentRecipe).mockRejectedValue(
    new Error("BUILDER_API_URL is not set"),
  );
  vi.mocked(api.get).mockRejectedValue(new Error("BUILDER_API_URL is not set"));
  vi.mocked(loadLandingContentPage).mockResolvedValue({
    frontmatter: { title: "Register as a private CSEC candidate" },
    body: "Page body",
    sha: "0123456789abcdef0123456789abcdef01234567",
    revision: { source: "base" },
    reviewBlock: null,
  } as never);
  const result = (await (
    loadServiceSource as unknown as (arg: unknown) => Promise<ServiceSnapshot>
  )({
    data: {
      serviceId: "csec",
      title: "CSEC Examination",
      category: "education",
      formId: "csec",
      paths: ["apps/landing/src/content/education/csec.md"],
    },
    context: { session: { login: "editor", accessToken: "test-token" } },
  })) satisfies ServiceSnapshot;
  expect(result.manifest.formId).toBe("csec");
  expect(result.recipe).toBeNull();
  expect(result.pendingConfig).toEqual({
    mdaContactId: null,
    processors: null,
  });
  expect(result.manifest.pages[0]).toMatchObject({ kind: "main" });
  expect(serviceReadiness(result).issues.map((issue) => issue.id)).toContain(
    "missing-form",
  );
  expect(result.manifest.setup).toEqual({
    step: "about",
    delivery: "undecided",
    applicantEmail: "undecided",
  });
});

it("adopts a form through the same stale-draft re-sync getRecipe uses (#2897)", async () => {
  // resolveCurrentRecipe hands back the committed recipe once the API has
  // confirmed the draft row predated it (forms.spec covers that exchange).
  // First adoption must store that copy — not the pre-fix row the save-path
  // resolver (resolveStoredRecipe) would return — so adopting and the later
  // getServiceDraft refresh (which goes through getRecipe) agree.
  const committed = {
    formId: "csec",
    title: "CSEC Examination (fixed on main)",
    steps: [{ stepId: "submission-confirmation", title: "Done", elements: [] }],
  };
  vi.mocked(resolveCurrentRecipe).mockResolvedValue(committed as never);
  vi.mocked(resolveStoredRecipe).mockResolvedValue({
    ...committed,
    title: "CSEC Examination (stale row)",
  } as never);
  vi.mocked(api.get).mockResolvedValue({
    mdaContactId: null,
    processors: null,
  });
  const result = await (
    loadServiceSource as unknown as (arg: unknown) => Promise<ServiceSnapshot>
  )({
    data: {
      serviceId: "csec",
      title: "CSEC Examination",
      category: "education",
      formId: "csec",
      paths: [],
    },
    context: { session: { login: "editor", accessToken: "test-token" } },
  });
  expect(result.recipe?.title).toBe("CSEC Examination (fixed on main)");
  expect(resolveCurrentRecipe).toHaveBeenCalledWith("csec", "test-token");
  expect(resolveStoredRecipe).not.toHaveBeenCalled();
});

it("seeds the After submission decisions and public contact from the recipe (#2683)", async () => {
  vi.mocked(resolveCurrentRecipe).mockResolvedValue({
    formId: "csec",
    title: "CSEC Examination",
    steps: [
      {
        stepId: "your-details",
        title: "Your details",
        elements: [{ ref: "components/generic-text" }],
      },
      { stepId: "submission-confirmation", title: "Done", elements: [] },
    ],
    processors: [
      {
        type: "email",
        config: { recipientField: "your-details.email" },
      },
    ],
    contactDetails: { email: "exams@example.test" },
  } as never);
  vi.mocked(api.get).mockResolvedValue({
    mdaContactId: null,
    processors: null,
  });
  const result = await (
    loadServiceSource as unknown as (arg: unknown) => Promise<ServiceSnapshot>
  )({
    data: {
      serviceId: "csec",
      title: "CSEC Examination",
      category: "education",
      formId: "csec",
      paths: [],
    },
    context: { session: { login: "editor", accessToken: "test-token" } },
  });
  expect(result.manifest).not.toHaveProperty("visibility");
  expect(result.manifest.contactDetails).toEqual({
    email: "exams@example.test",
  });
  expect(result.manifest.setup).toEqual({
    step: "about",
    delivery: "none",
    applicantEmail: "configured",
  });
  expect(serviceReadiness(result)).toEqual({ ready: true, issues: [] });
});
