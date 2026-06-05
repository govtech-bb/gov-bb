/**
 * @jest-environment node
 */
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

// Mock the session-cipher module before importing the SUT.
jest.mock("./session-cipher.server", () => ({
  getSession: jest.fn(),
}));
jest.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
// Mock the API client so the server-side /validate gate is controllable and
// never touches globalThis.fetch — the GitHub steps below mock fetch directly.
jest.mock("./api-client", () => ({
  api: { post: jest.fn(), get: jest.fn(), put: jest.fn(), del: jest.fn() },
}));

import { getSession } from "./session-cipher.server";
import { api } from "./api-client";
import { publishRecipe, eraseRecipe } from "./publish";

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

const RECIPE: ServiceContractRecipe = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  description: "Renew your passport",
  version: "1.2.0",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
  steps: [],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

beforeEach(() => {
  jest.resetAllMocks();
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  process.env.GITHUB_ORG = "govtech-bb";
  (getSession as jest.Mock).mockReturnValue(SESSION);
  // Default: the server-side /validate gate passes. Tests that exercise a
  // rejection override this.
  (api.post as jest.Mock).mockResolvedValue({ ok: true, data: RECIPE });
  // Freeze "now" so branch names are deterministic.
  jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SESSION_SECRET;
  delete process.env.GITHUB_ORG;
  delete process.env.PUBLISH_BASE_BRANCH;
});

describe("publishRecipe", () => {
  it("returns { prUrl, prNumber } on the happy path", async () => {
    const fetchMock = jest
      .fn()
      // Step 1: get dev ref
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      // Step 2: create branch
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      // Step 3: contents check (404 = not present, OK)
      .mockResolvedValueOnce(emptyResponse(404))
      // Step 4: PUT contents
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      // Step 5: open PR
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      data: { recipe: RECIPE, description: "Adds passport-renewal v1.2.0" },
    });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/42",
      prNumber: 42,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Step 1
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/ref/heads/dev",
    );
    // Headers carry the bearer token.
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer gho_test_token",
      Accept: "application/vnd.github+json",
    });

    // Step 2: branch ref shape and pointing at dev sha
    const step2 = fetchMock.mock.calls[1];
    expect(step2[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs",
    );
    const step2Body = JSON.parse((step2[1] as RequestInit).body as string);
    expect(step2Body).toEqual({
      ref: "refs/heads/form-builder/passport-renewal-1-2-0-1700000000000",
      sha: "devsha123",
    });

    // Step 3: contents GET on the new branch — recipes live colocated with the
    // API form-definitions module so the API's file loader, the dump script,
    // the Dockerfile, and this publish flow all point at the same path.
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal/1.2.0.json?ref=form-builder%2Fpassport-renewal-1-2-0-1700000000000",
    );

    // Step 4: PUT with base64 content and matching message
    const step4 = fetchMock.mock.calls[3];
    expect(step4[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal/1.2.0.json",
    );
    const step4Body = JSON.parse((step4[1] as RequestInit).body as string);
    expect(step4Body.branch).toBe(
      "form-builder/passport-renewal-1-2-0-1700000000000",
    );
    expect(step4Body.message).toBe("Publish passport-renewal v1.2.0");
    const expectedFileContent = JSON.stringify(RECIPE, null, 2) + "\n";
    expect(Buffer.from(step4Body.content, "base64").toString("utf8")).toBe(
      expectedFileContent,
    );

    // Step 5: PR body contains the templated fields
    const step5 = fetchMock.mock.calls[4];
    expect(step5[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/pulls",
    );
    const step5Body = JSON.parse((step5[1] as RequestInit).body as string);
    expect(step5Body.base).toBe("dev");
    expect(step5Body.head).toBe(
      "form-builder/passport-renewal-1-2-0-1700000000000",
    );
    expect(step5Body.title).toBe("Publish form: Passport Renewal v1.2.0");
    expect(step5Body.body).toContain("Form ID: `passport-renewal`");
    expect(step5Body.body).toContain("Version: `1.2.0`");
    expect(step5Body.body).toContain("@alice");
    expect(step5Body.body).toContain("Adds passport-renewal v1.2.0");
  });

  it("sanitizes dots out of the branch name but keeps the dotted version in the file path, message, and title (#805)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({ data: { recipe: RECIPE, description: "" } });

    // Branch name: no "." anywhere — CI's pr-preview "Guard branch name" step
    // hard-fails dotted branches (Amplify preview cert breakage).
    const step2Body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(step2Body.ref).toBe(
      "refs/heads/form-builder/passport-renewal-1-2-0-1700000000000",
    );
    expect(step2Body.ref).not.toContain(".");

    // The committed artifacts keep the real dotted version.
    const step4 = fetchMock.mock.calls[3];
    expect(step4[0]).toContain("/passport-renewal/1.2.0.json");
    const step4Body = JSON.parse((step4[1] as RequestInit).body as string);
    expect(step4Body.message).toBe("Publish passport-renewal v1.2.0");
    const step5Body = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    expect(step5Body.title).toBe("Publish form: Passport Renewal v1.2.0");
  });

  it("throws version-already-exists and cleans up the branch when step 3 returns 200", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      // contents/ returns 200 — version already exists
      .mockResolvedValueOnce(jsonResponse(200, { sha: "blobsha" }))
      // cleanup DELETE
      .mockResolvedValueOnce(emptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(
      /Version 1\.2\.0 already exists on dev\. Bump the version and try again\./,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const cleanup = fetchMock.mock.calls[3];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/passport-renewal-1-2-0-1700000000000",
    );
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("cleans up the branch when PUT contents (step 4) fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(422, { message: "boom" }))
      .mockResolvedValueOnce(emptyResponse(204)); // cleanup
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Failed to write recipe file/);

    const cleanup = fetchMock.mock.calls[4];
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("cleans up the branch when PR creation (step 5) fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      .mockResolvedValueOnce(jsonResponse(500, { message: "internal" }))
      .mockResolvedValueOnce(emptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Failed to open pull request/);

    const cleanup = fetchMock.mock.calls[5];
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("does not attempt cleanup when step 1 (get dev ref) fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { message: "not found" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Failed to read dev branch/);

    // No DELETE call because no branch was created.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt cleanup when step 2 (create branch) fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(422, { message: "ref exists" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Failed to create branch/);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses PUBLISH_BASE_BRANCH for the base ref and PR base when set", async () => {
    process.env.PUBLISH_BASE_BRANCH = "sandbox";
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "sandboxsha" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 7,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/7",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({ data: { recipe: RECIPE, description: "" } });

    // Step 1: base ref read from the configured branch, not dev.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/ref/heads/sandbox",
    );
    // Step 5: PR opened against the configured branch.
    const step5Body = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    expect(step5Body.base).toBe("sandbox");
  });

  it("reports the configured branch in the version-already-exists error", async () => {
    process.env.PUBLISH_BASE_BRANCH = "sandbox";
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "sandboxsha" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(jsonResponse(200, { sha: "blobsha" }))
      .mockResolvedValueOnce(emptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/already exists on sandbox/);
  });

  it("validates against the API before opening a branch/PR", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { object: { sha: "devsha" } }))
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 1,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/1",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({ data: { recipe: RECIPE, description: "" } });

    expect(api.post).toHaveBeenCalledWith("/builder/registry/validate", {
      recipe: RECIPE,
    });
  });

  it("throws and opens no branch/PR when the recipe has an unresolvable ref", async () => {
    (api.post as jest.Mock).mockResolvedValue({
      ok: false,
      issues: [
        {
          path: "steps[step-1].elements[0].ref",
          message: 'Unknown component/block ref "components/generic/text"',
        },
      ],
    });
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Recipe validation failed:.*components\/generic\/text/);

    // No GitHub calls at all — validation gates before step 1.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rethrows the original error even when cleanup itself fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(jsonResponse(422, { message: "boom" }))
      // cleanup fails too
      .mockResolvedValueOnce(jsonResponse(500, { message: "delete-fail" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({ data: { recipe: RECIPE, description: "" } }),
    ).rejects.toThrow(/Failed to write recipe file/);
  });
});

const ERASE = {
  formId: "passport-renewal",
  title: "Passport Renewal",
  reason: "Service retired — replaced by online flow.",
};

/** The Contents-API directory listing `listVersions` parses. */
function dirListing(versions: string[]) {
  return versions.map((v) => ({ name: `${v}.json`, type: "file" }));
}

describe("eraseRecipe", () => {
  beforeEach(() => {
    // Default: the form is not in the disabled index, so the gate passes.
    (api.get as jest.Mock).mockResolvedValue([]);
  });

  it("opens a single-commit folder-delete PR on the happy path", async () => {
    const fetchMock = jest
      .fn()
      // listVersions: directory listing on the base branch
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0", "1.1.0"])))
      // get base ref
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      // create branch
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      // read base commit -> tree sha
      .mockResolvedValueOnce(
        jsonResponse(200, { tree: { sha: "basetree123" } }),
      )
      // create tree (folder deleted)
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newtree456" }))
      // create commit
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newcommit789" }))
      // patch branch ref
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "newcommit789" } }),
      )
      // open PR
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 99,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/99",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await eraseRecipe({ data: ERASE });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/99",
      prNumber: 99,
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);

    // The disabled index is consulted before anything is created.
    expect(api.get).toHaveBeenCalledWith("/builder/forms/disabled");

    // listVersions reads on the base branch.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal?ref=dev",
    );

    // Base ref read.
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/ref/heads/dev",
    );

    // Branch is namespaced for erase and points at the base tip.
    const createBranch = fetchMock.mock.calls[2];
    expect(createBranch[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs",
    );
    expect(JSON.parse((createBranch[1] as RequestInit).body as string)).toEqual(
      {
        ref: "refs/heads/form-builder/erase-passport-renewal-1700000000000",
        sha: "devsha123",
      },
    );

    // Base commit read for its tree sha.
    expect(fetchMock.mock.calls[3][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/commits/devsha123",
    );

    // Tree built off the base tree with every version file set to sha:null.
    const treeCall = fetchMock.mock.calls[4];
    expect(treeCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/trees",
    );
    const treeBody = JSON.parse((treeCall[1] as RequestInit).body as string);
    expect(treeBody.base_tree).toBe("basetree123");
    expect(treeBody.tree).toEqual([
      {
        path: "apps/api/src/forms/form-definitions/recipes/passport-renewal/1.0.0.json",
        mode: "100644",
        type: "blob",
        sha: null,
      },
      {
        path: "apps/api/src/forms/form-definitions/recipes/passport-renewal/1.1.0.json",
        mode: "100644",
        type: "blob",
        sha: null,
      },
    ]);

    // Commit parented on the base tip, pointing at the new tree.
    const commitCall = fetchMock.mock.calls[5];
    expect(commitCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/commits",
    );
    const commitBody = JSON.parse(
      (commitCall[1] as RequestInit).body as string,
    );
    expect(commitBody.tree).toBe("newtree456");
    expect(commitBody.parents).toEqual(["devsha123"]);

    // Branch ref fast-forwarded to the new commit.
    const patchCall = fetchMock.mock.calls[6];
    expect(patchCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/erase-passport-renewal-1700000000000",
    );
    expect((patchCall[1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((patchCall[1] as RequestInit).body as string).sha).toBe(
      "newcommit789",
    );

    // PR titled + bodied for erase, against the base branch.
    const prCall = fetchMock.mock.calls[7];
    expect(prCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/pulls",
    );
    const prBody = JSON.parse((prCall[1] as RequestInit).body as string);
    expect(prBody.base).toBe("dev");
    expect(prBody.head).toBe(
      "form-builder/erase-passport-renewal-1700000000000",
    );
    expect(prBody.title).toBe(
      "Erase form: Passport Renewal (passport-renewal)",
    );
    expect(prBody.body).toContain("passport-renewal");
    expect(prBody.body).toContain("1.0.0");
    expect(prBody.body).toContain("1.1.0");
    expect(prBody.body).toContain("@alice");
    expect(prBody.body).toContain("Service retired");
  });

  it("refuses (no branch, no PR) when the form is disabled", async () => {
    (api.get as jest.Mock).mockResolvedValue(["passport-renewal"]);
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(eraseRecipe({ data: ERASE })).rejects.toThrow(/disabled/i);

    // The disabled gate fires before any GitHub call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses (no branch, no PR) when the folder has no versions to erase", async () => {
    const fetchMock = jest
      .fn()
      // listVersions: empty folder (404 -> [])
      .mockResolvedValueOnce(emptyResponse(404));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(eraseRecipe({ data: ERASE })).rejects.toThrow(
      /nothing to erase/i,
    );

    // Only the listing was attempted — no branch created.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up the branch when tree creation fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0"])))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { tree: { sha: "basetree123" } }),
      )
      // tree creation fails
      .mockResolvedValueOnce(jsonResponse(422, { message: "boom" }))
      // cleanup DELETE
      .mockResolvedValueOnce(emptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(eraseRecipe({ data: ERASE })).rejects.toThrow(
      /Failed to create tree/,
    );

    const cleanup = fetchMock.mock.calls[5];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/erase-passport-renewal-1700000000000",
    );
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("does not attempt cleanup when branch creation fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0"])))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      // create branch fails
      .mockResolvedValueOnce(jsonResponse(422, { message: "ref exists" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(eraseRecipe({ data: ERASE })).rejects.toThrow(
      /Failed to create branch/,
    );

    // No DELETE — the branch was never created.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("erases on the configured PUBLISH_BASE_BRANCH when set", async () => {
    process.env.PUBLISH_BASE_BRANCH = "sandbox";
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0"])))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "sandboxsha" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(jsonResponse(200, { tree: { sha: "basetree" } }))
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newtree" }))
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newcommit" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "newcommit" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 7,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/7",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await eraseRecipe({ data: ERASE });

    // listVersions and the base ref both read sandbox.
    expect(fetchMock.mock.calls[0][0]).toContain("?ref=sandbox");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/ref/heads/sandbox",
    );
    const prBody = JSON.parse(
      (fetchMock.mock.calls[7][1] as RequestInit).body as string,
    );
    expect(prBody.base).toBe("sandbox");
  });

  it("cleans up the branch when PR creation (final step) fails", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0"])))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { tree: { sha: "basetree123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newtree456" }))
      .mockResolvedValueOnce(jsonResponse(201, { sha: "newcommit789" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "newcommit789" } }),
      )
      // PR open fails
      .mockResolvedValueOnce(jsonResponse(500, { message: "internal" }))
      // cleanup DELETE
      .mockResolvedValueOnce(emptyResponse(204));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(eraseRecipe({ data: ERASE })).rejects.toThrow(
      /Failed to open pull request/,
    );

    const cleanup = fetchMock.mock.calls[8];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/erase-passport-renewal-1700000000000",
    );
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("rejects an empty reason without consulting the disabled index or GitHub", async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // The reason is the audit trail for a permanent delete — the server (not
    // just the bypassable client modal) must require it.
    await expect(
      eraseRecipe({ data: { ...ERASE, reason: "" } }),
    ).rejects.toThrow();

    expect(api.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
