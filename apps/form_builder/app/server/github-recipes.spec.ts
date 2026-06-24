import type { Mock } from "vitest";
import { getPublishedRecipe } from "./github-recipes";
import { REPO_NAME } from "./github-repo";

const REPO_OWNER = "govtech-bb";

type FetchMock = Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

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
    fetchMock = vi.fn() as unknown as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.resetAllMocks();
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
      expect(url).toBe(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal.json`,
      );
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
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
