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
}));
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
