import type { ServiceContractRecipe } from "@govtech-bb/form-types";

const mockGetRef = jest.fn();
const mockCreateRef = jest.fn();
const mockCreateOrUpdateFileContents = jest.fn();
const mockCreatePR = jest.fn();
const mockOctokitConstructor = jest.fn().mockImplementation(() => ({
  git: {
    getRef: mockGetRef,
    createRef: mockCreateRef,
  },
  repos: {
    createOrUpdateFileContents: mockCreateOrUpdateFileContents,
  },
  pulls: {
    create: mockCreatePR,
  },
}));

jest.mock("@octokit/rest", () => ({
  Octokit: mockOctokitConstructor,
}));

import { openPublishPr } from "./github-publish.server";

const ORIGINAL_ENV = { ...process.env };

function makeRecipe(
  overrides: Partial<ServiceContractRecipe> = {},
): ServiceContractRecipe {
  return {
    formId: "test-form",
    title: "Test Form",
    version: "1.2.3",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [],
    ...overrides,
  } as ServiceContractRecipe;
}

beforeEach(() => {
  process.env.GITHUB_REPO_OWNER = "govtech-bb";
  process.env.GITHUB_REPO_NAME = "gov-bb";
  process.env.GITHUB_PR_BASE_BRANCH = "dev";

  mockGetRef.mockReset();
  mockCreateRef.mockReset();
  mockCreateOrUpdateFileContents.mockReset();
  mockCreatePR.mockReset();
  mockOctokitConstructor.mockClear();

  mockGetRef.mockResolvedValue({ data: { object: { sha: "base-sha-abc" } } });
  mockCreateRef.mockResolvedValue({ data: {} });
  mockCreateOrUpdateFileContents.mockResolvedValue({ data: {} });
  mockCreatePR.mockResolvedValue({
    data: {
      html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
      number: 42,
    },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("openPublishPr", () => {
  it("creates a branch from the base branch's HEAD, commits the recipe, opens a PR, and returns the URL", async () => {
    const result = await openPublishPr({
      formId: "test-form",
      version: "1.2.3",
      recipe: makeRecipe(),
      prDescription: "Add new test form",
      userToken: "user-token",
    });

    expect(mockOctokitConstructor).toHaveBeenCalledWith({ auth: "user-token" });

    expect(mockGetRef).toHaveBeenCalledWith({
      owner: "govtech-bb",
      repo: "gov-bb",
      ref: "heads/dev",
    });

    expect(mockCreateRef).toHaveBeenCalledTimes(1);
    const createRefArgs = mockCreateRef.mock.calls[0][0];
    expect(createRefArgs.owner).toBe("govtech-bb");
    expect(createRefArgs.repo).toBe("gov-bb");
    expect(createRefArgs.ref).toMatch(
      /^refs\/heads\/formbuilder\/publish-test-form-1\.2\.3-[0-9a-f]{7}$/,
    );
    expect(createRefArgs.sha).toBe("base-sha-abc");

    expect(mockCreateOrUpdateFileContents).toHaveBeenCalledTimes(1);
    const fileArgs = mockCreateOrUpdateFileContents.mock.calls[0][0];
    expect(fileArgs.path).toBe("recipes/test-form/1.2.3.json");
    expect(fileArgs.branch).toBe(createRefArgs.ref.replace("refs/heads/", ""));
    expect(fileArgs.message).toBe("Publish test-form v1.2.3");

    const written = Buffer.from(fileArgs.content as string, "base64").toString(
      "utf8",
    );
    expect(written.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(written);
    expect(parsed.formId).toBe("test-form");
    // Canonical form sorts keys: createdAt before formId before steps before title before updatedAt before version
    expect(Object.keys(parsed)).toEqual([
      "createdAt",
      "formId",
      "steps",
      "title",
      "updatedAt",
      "version",
    ]);

    expect(mockCreatePR).toHaveBeenCalledWith({
      owner: "govtech-bb",
      repo: "gov-bb",
      title: "Publish test-form v1.2.3",
      head: createRefArgs.ref.replace("refs/heads/", ""),
      base: "dev",
      body: "Add new test form",
    });

    expect(result.prUrl).toBe("https://github.com/govtech-bb/gov-bb/pull/42");
    expect(result.prNumber).toBe(42);
    expect(result.branchName).toBe(
      createRefArgs.ref.replace("refs/heads/", ""),
    );
  });

  it("generates a different short hash for repeat publishes of the same form+version", async () => {
    const first = await openPublishPr({
      formId: "f",
      version: "1.0.0",
      recipe: makeRecipe({ formId: "f", version: "1.0.0" }),
      prDescription: "first",
      userToken: "tok",
    });
    // Advance the clock so the ISO timestamp differs.
    const nextIso = new Date(Date.now() + 1000).toISOString();
    const realToISO = Date.prototype.toISOString;
    jest
      .spyOn(Date.prototype, "toISOString")
      .mockImplementationOnce(() => nextIso);
    const second = await openPublishPr({
      formId: "f",
      version: "1.0.0",
      recipe: makeRecipe({ formId: "f", version: "1.0.0" }),
      prDescription: "second",
      userToken: "tok",
    });
    Date.prototype.toISOString = realToISO;

    expect(first.branchName).not.toBe(second.branchName);
  });

  it("honours custom GITHUB_REPO_OWNER / NAME / PR_BASE_BRANCH env vars", async () => {
    process.env.GITHUB_REPO_OWNER = "acme";
    process.env.GITHUB_REPO_NAME = "forms";
    process.env.GITHUB_PR_BASE_BRANCH = "staging";

    await openPublishPr({
      formId: "f",
      version: "1.0.0",
      recipe: makeRecipe({ formId: "f", version: "1.0.0" }),
      prDescription: "",
      userToken: "tok",
    });

    expect(mockGetRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "forms",
      ref: "heads/staging",
    });
    expect(mockCreatePR.mock.calls[0][0]).toMatchObject({
      owner: "acme",
      repo: "forms",
      base: "staging",
    });
  });

  it("propagates errors from createRef (e.g. branch-already-exists)", async () => {
    mockCreateRef.mockRejectedValueOnce(new Error("Reference already exists"));

    await expect(
      openPublishPr({
        formId: "f",
        version: "1.0.0",
        recipe: makeRecipe({ formId: "f", version: "1.0.0" }),
        prDescription: "",
        userToken: "tok",
      }),
    ).rejects.toThrow(/already exists/);
  });
});
