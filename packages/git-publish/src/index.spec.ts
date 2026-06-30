import type { Mock } from "vitest";
import { authHeaders, ghError, createPublishClient } from "./index";

const REPO = { owner: "acme", repo: "widgets" };

function mockFetch(impl: (url: string, init?: RequestInit) => unknown): Mock {
  const fn = vi.fn(impl) as Mock;
  (global as { fetch?: unknown }).fetch = fn;
  return fn;
}

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch;
  vi.restoreAllMocks();
});

describe("authHeaders", () => {
  it("carries the bearer token and the GitHub API version", () => {
    expect(authHeaders("tok")).toEqual({
      Authorization: "Bearer tok",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
  });
});

describe("ghError", () => {
  it("includes the label, status and a truncated body", async () => {
    const res = {
      status: 422,
      text: () => Promise.resolve("x".repeat(600)),
    } as unknown as Response;
    const err = await ghError("Failed to do thing", res);
    expect(err.message).toContain("Failed to do thing");
    expect(err.message).toContain("status 422");
    // body is truncated to 500 chars
    expect(err.message.length).toBeLessThan(
      "Failed to do thing (status 422): ".length + 510,
    );
  });

  it("survives a body that cannot be read", async () => {
    const res = {
      status: 500,
      text: () => Promise.reject(new Error("nope")),
    } as unknown as Response;
    const err = await ghError("Boom", res);
    expect(err.message).toContain("status 500");
  });
});

describe("createPublishClient", () => {
  it("repoUrl builds an owner/repo-scoped API URL", () => {
    const gh = createPublishClient(REPO);
    expect(gh.repoUrl("/contents/x.json")).toBe(
      "https://api.github.com/repos/acme/widgets/contents/x.json",
    );
  });

  describe("createBranchFrom", () => {
    it("reads the base tip then POSTs a new ref, returning the base sha", async () => {
      const fetchMock = mockFetch((url) => {
        if (url.includes("/git/ref/heads/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ object: { sha: "base-sha" } }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const gh = createPublishClient(REPO);
      const sha = await gh.createBranchFrom("tok", "dev", "feature");

      expect(sha).toBe("base-sha");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.github.com/repos/acme/widgets/git/ref/heads/dev",
      );
      const create = fetchMock.mock.calls[1];
      expect(create[0]).toBe(
        "https://api.github.com/repos/acme/widgets/git/refs",
      );
      expect(create[1]).toMatchObject({ method: "POST" });
      expect(JSON.parse(create[1].body)).toEqual({
        ref: "refs/heads/feature",
        sha: "base-sha",
      });
    });

    it("throws when the base ref read fails", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve(""),
        }),
      );
      const gh = createPublishClient(REPO);
      await expect(
        gh.createBranchFrom("tok", "dev", "feature"),
      ).rejects.toThrow(/Failed to read dev branch/);
    });

    it("throws when the ref create fails", async () => {
      mockFetch((url) => {
        if (url.includes("/git/ref/heads/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ object: { sha: "base-sha" } }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 422,
          text: () => Promise.resolve("dup"),
        });
      });
      const gh = createPublishClient(REPO);
      await expect(
        gh.createBranchFrom("tok", "dev", "feature"),
      ).rejects.toThrow(/Failed to create branch/);
    });
  });

  describe("putFile", () => {
    it("base64-encodes content and omits sha when creating", async () => {
      const fetchMock = mockFetch(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      );
      const gh = createPublishClient(REPO);
      await gh.putFile("tok", {
        path: "recipes/a/1.0.0.json",
        message: "msg",
        content: "hello",
        branch: "feature",
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://api.github.com/repos/acme/widgets/contents/recipes/a/1.0.0.json",
      );
      expect(init.method).toBe("PUT");
      const body = JSON.parse(init.body);
      expect(body.content).toBe(
        Buffer.from("hello", "utf8").toString("base64"),
      );
      expect(body.branch).toBe("feature");
      expect("sha" in body).toBe(false);
    });

    it("includes sha when updating", async () => {
      const fetchMock = mockFetch(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      );
      const gh = createPublishClient(REPO);
      await gh.putFile("tok", {
        path: "p.json",
        message: "m",
        content: "c",
        branch: "b",
        sha: "old-sha",
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.sha).toBe("old-sha");
    });
  });

  describe("getContents", () => {
    it("GETs the contents path with an encoded ref", async () => {
      const fetchMock = mockFetch(() => Promise.resolve({ status: 200 }));
      const gh = createPublishClient(REPO);
      await gh.getContents("tok", "dir/file.json", "feature/x");
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.github.com/repos/acme/widgets/contents/dir/file.json?ref=feature%2Fx",
      );
    });
  });

  describe("openPullRequest", () => {
    it("returns the PR url and number", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ number: 7, html_url: "https://pr/7" }),
        }),
      );
      const gh = createPublishClient(REPO);
      const pr = await gh.openPullRequest("tok", {
        base: "dev",
        head: "feature",
        title: "t",
        body: "b",
      });
      expect(pr).toEqual({ prUrl: "https://pr/7", prNumber: 7 });
    });

    it("throws on a non-ok response", async () => {
      mockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("boom"),
        }),
      );
      const gh = createPublishClient(REPO);
      await expect(
        gh.openPullRequest("tok", {
          base: "dev",
          head: "f",
          title: "t",
          body: "b",
        }),
      ).rejects.toThrow(/Failed to open pull request/);
    });
  });

  describe("deleteBranch", () => {
    it("DELETEs the ref and swallows network errors", async () => {
      const fetchMock = mockFetch(() => Promise.reject(new Error("net")));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const gh = createPublishClient(REPO);
      await expect(gh.deleteBranch("tok", "feature")).resolves.toBeUndefined();
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.github.com/repos/acme/widgets/git/refs/heads/feature",
      );
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("listOpenPRHeads", () => {
    it("paginates and maps to {number, htmlUrl, headRef}", async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        number: i,
        html_url: `https://pr/${i}`,
        head: { ref: `branch-${i}` },
      }));
      const page2 = [
        {
          number: 100,
          html_url: "https://pr/100",
          head: { ref: "branch-100" },
        },
      ];
      const fetchMock = mockFetch((url) => {
        const isPage2 = url.includes("page=2");
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(isPage2 ? page2 : page1),
        });
      });
      const gh = createPublishClient(REPO);
      const heads = await gh.listOpenPRHeads("tok", "dev");
      expect(heads).toHaveLength(101);
      expect(heads[0]).toEqual({
        number: 0,
        htmlUrl: "https://pr/0",
        headRef: "branch-0",
      });
      // stops after page 2 returns < 100
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain(
        "/pulls?state=open&base=dev&per_page=100&page=1",
      );
    });
  });
});
