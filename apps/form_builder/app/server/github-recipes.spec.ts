import type { Mock } from "vitest";
import { getPublishedRecipe, getRecipeCommittedAt } from "./github-recipes";
import { REPO_NAME } from "./github-repo";

const REPO_OWNER = "govtech-bb";

type FetchMock = Mock<typeof fetch>;

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastFetch(mock: FetchMock): { url: string; init: RequestInit } {
  const call = mock.mock.calls[mock.mock.calls.length - 1];
  const url = typeof call[0] === "string" ? call[0] : call[0].toString();
  return { url, init: call[1] ?? {} };
}

describe("github-recipes", () => {
  let fetchMock: FetchMock;
  const TOKEN = "ghu_testtoken";

  beforeEach(() => {
    process.env.GITHUB_ORG = REPO_OWNER;
    // Unset so the default base branch (`main`) applies; the "configured
    // branch" tests below set it explicitly.
    delete process.env.PUBLISH_BASE_BRANCH;
    fetchMock = vi.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.PUBLISH_BASE_BRANCH;
  });

  describe("getRecipeCommittedAt (#2489)", () => {
    it("returns the committer date of the latest commit touching the flat recipe", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, [
          {
            sha: "abc123",
            commit: {
              // A rebased fix: written on the 10th, landed on the 15th. Landing
              // is what makes a draft stale, so the committer date wins.
              author: { date: "2026-09-10T08:00:00Z" },
              committer: { date: "2026-09-15T10:00:00Z" },
            },
          },
        ]),
      );

      const date = await getRecipeCommittedAt(TOKEN, "passport-renewal");

      expect(date).toBe("2026-09-15T10:00:00Z");
      const { url, init } = lastFetch(fetchMock);
      // Same branch as getPublishedRecipe and the Deploy guard — the
      // configured base branch, `main` by default (#2899) — one commit.
      expect(url).toBe(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=main&path=apps%2Fapi%2Fsrc%2Fforms%2Fform-definitions%2Frecipes%2Fpassport-renewal.json&per_page=1`,
      );
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`,
      );
    });

    it("lists commits on the configured PUBLISH_BASE_BRANCH, not the repo default (#2899)", async () => {
      process.env.PUBLISH_BASE_BRANCH = "sandbox";
      fetchMock.mockResolvedValueOnce(makeJsonResponse(200, []));

      await getRecipeCommittedAt(TOKEN, "passport-renewal");

      expect(lastFetch(fetchMock).url).toContain("/commits?sha=sandbox&");
    });

    it("returns null when no commit touches the path (nothing committed)", async () => {
      fetchMock.mockResolvedValueOnce(makeJsonResponse(200, []));

      await expect(
        getRecipeCommittedAt(TOKEN, "never-published"),
      ).resolves.toBeNull();
    });

    it("throws on a non-2xx response", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(500, { message: "boom" }),
      );

      await expect(
        getRecipeCommittedAt(TOKEN, "passport-renewal"),
      ).rejects.toThrow(/Commits API returned 500/);
    });
  });

  describe("getPublishedRecipe", () => {
    const RECIPE = {
      formId: "passport-renewal",
      title: "Passport Renewal",
      version: "1.1.0",
      description: "Renew your passport",
      steps: [],
    };

    it("fetches and decodes the canonical flat recipe (#1196)", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "passport-renewal.json",
          encoding: "base64",
          content: Buffer.from(JSON.stringify(RECIPE), "utf8").toString(
            "base64",
          ),
        }),
      );

      const recipe = await getPublishedRecipe(TOKEN, {
        formId: "passport-renewal",
      });

      expect(recipe).toEqual(RECIPE);
      const { url, init } = lastFetch(fetchMock);
      // Read off the configured base branch (`main` by default), the same
      // branch the Deploy stale-base guard compares against (#2899).
      expect(url).toBe(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal.json?ref=main`,
      );
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("reads the configured PUBLISH_BASE_BRANCH, not the repo default (#2899)", async () => {
      process.env.PUBLISH_BASE_BRANCH = "sandbox";
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "passport-renewal.json",
          encoding: "base64",
          content: Buffer.from(JSON.stringify(RECIPE), "utf8").toString(
            "base64",
          ),
        }),
      );

      await getPublishedRecipe(TOKEN, { formId: "passport-renewal" });

      expect(lastFetch(fetchMock).url).toMatch(/\?ref=sandbox$/);
    });

    it("throws when the file is missing (404)", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(404, { message: "Not Found" }),
      );

      await expect(
        getPublishedRecipe(TOKEN, { formId: "ghost" }),
      ).rejects.toThrow(/not found/i);
    });

    it("throws when the response is not base64-encoded", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "passport-renewal.json",
          encoding: "utf-8",
          content: "{}",
        }),
      );

      await expect(
        getPublishedRecipe(TOKEN, { formId: "passport-renewal" }),
      ).rejects.toThrow(/encoding/i);
    });

    it("throws when the file content is null (file too large)", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "big-form.json",
          encoding: "base64",
          content: null,
        }),
      );

      await expect(
        getPublishedRecipe(TOKEN, { formId: "big-form" }),
      ).rejects.toThrow(/no inline content/i);
    });
  });
});
