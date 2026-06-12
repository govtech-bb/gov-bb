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

    it("fetches and decodes a specific version", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "1.1.0.json",
          encoding: "base64",
          content: Buffer.from(JSON.stringify(RECIPE), "utf8").toString(
            "base64",
          ),
        }),
      );

      const recipe = await getPublishedRecipe(TOKEN, {
        formId: "passport-renewal",
        version: "1.1.0",
      });

      expect(recipe).toEqual(RECIPE);
      const { url, init } = lastFetch(fetchMock);
      expect(url).toBe(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal/1.1.0.json`,
      );
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("resolves the latest version when version is omitted", async () => {
      // 1) list versions
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, [
          { name: "1.0.0.json", type: "file" },
          { name: "1.10.0.json", type: "file" },
          { name: "1.2.0.json", type: "file" },
        ]),
      );
      // 2) fetch the picked version
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "1.10.0.json",
          encoding: "base64",
          content: Buffer.from(
            JSON.stringify({ ...RECIPE, version: "1.10.0" }),
            "utf8",
          ).toString("base64"),
        }),
      );

      const recipe = await getPublishedRecipe(TOKEN, {
        formId: "passport-renewal",
      });

      expect(recipe.version).toBe("1.10.0");
    });

    it("throws when the file is missing (404)", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(404, { message: "Not Found" }),
      );

      await expect(
        getPublishedRecipe(TOKEN, {
          formId: "ghost",
          version: "9.9.9",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("throws when the response is not base64-encoded", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "1.0.0.json",
          encoding: "utf-8",
          content: "{}",
        }),
      );

      await expect(
        getPublishedRecipe(TOKEN, {
          formId: "passport-renewal",
          version: "1.0.0",
        }),
      ).rejects.toThrow(/encoding/i);
    });

    it("throws when version is omitted and no versions exist", async () => {
      // listVersions returns [] (empty directory)
      fetchMock.mockResolvedValueOnce(makeJsonResponse(200, []));

      await expect(
        getPublishedRecipe(TOKEN, { formId: "passport-renewal" }),
      ).rejects.toThrow(/No recipe found/);
    });

    it("throws when the file content is null (file too large)", async () => {
      fetchMock.mockResolvedValueOnce(
        makeJsonResponse(200, {
          name: "1.0.0.json",
          encoding: "base64",
          content: null,
        }),
      );

      await expect(
        getPublishedRecipe(TOKEN, { formId: "big-form", version: "1.0.0" }),
      ).rejects.toThrow(/no inline content/i);
    });
  });
});
