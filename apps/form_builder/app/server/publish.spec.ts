import type { Mock } from "vitest";
/**
 * @vitest-environment node
 */
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

// Mock the session-cipher module before importing the SUT.
vi.mock("./session-cipher.server", () => ({
  getSession: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
// Mock the API client so the server-side /validate gate is controllable and
// never touches globalThis.fetch — the GitHub steps below mock fetch directly.
vi.mock("./api-client", async () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: (
    await vi.importActual<typeof import("./api-client")>("./api-client")
  ).ApiError,
}));

import { getSession } from "./session-cipher.server";
import { api, ApiError } from "./api-client";
import { publishRecipe, eraseRecipe, listOpenDeployPRs } from "./publish";

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

/** GET /pulls response for "no Deploy PR is open yet for this form" — the
 *  common case that every pre-#2390 publishRecipe test now needs at the front
 *  of its fetch chain, since publishRecipe looks this up before deciding
 *  whether to reuse a PR or create one. */
function noOpenPRs(): Response {
  return jsonResponse(200, []);
}

/** Raw shape of one `GET /pulls` entry, as the GitHub REST API returns it. */
function openPR(number: number, headRef: string) {
  return {
    number,
    html_url: `https://github.com/govtech-bb/gov-bb/pull/${number}`,
    head: { ref: headRef },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Clear here too (not just afterEach): jest reuses a worker process across
  // files, so the first test must not inherit a value leaked by an earlier
  // file — the default-branch assertions depend on it being unset.
  delete process.env.PUBLISH_BASE_BRANCH;
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  process.env.GITHUB_ORG = "govtech-bb";
  (getSession as Mock).mockReturnValue(SESSION);
  // Default: the server-side /validate gate passes. Tests that exercise a
  // rejection override this.
  (api.post as Mock).mockResolvedValue({ ok: true, data: RECIPE });
  // Freeze "now" so branch names are deterministic.
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SESSION_SECRET;
  delete process.env.GITHUB_ORG;
  delete process.env.PUBLISH_BASE_BRANCH;
});

describe("publishRecipe", () => {
  // The GitHub steps (findOpenPRByHeadRef → createBranchFrom → getContents →
  // putFile → openPullRequest) hit globalThis.fetch; validate + the
  // presence-enforcing save go through the api mock. #1196: publish overwrites
  // the canonical flat file in place — no version reservation, gate, or
  // versioned path. #2390: the very first GitHub call is now the open-PR
  // lookup — every chain below leads with `noOpenPRs()` unless it's
  // specifically testing the reuse path.
  function happyFetch() {
    return vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(jsonResponse(200, { sha: "existing-blob-sha" })) // GET existing flat file (for sha)
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      ); // POST pulls
  }

  it("saves the draft, overwrites the flat recipe in place, and opens a PR", async () => {
    const fetchMock = happyFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      data: { recipe: RECIPE, description: "Updates passport-renewal" },
      context: { session: SESSION },
    });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/42",
      prNumber: 42,
      updatedExistingPR: false,
    });

    // Presence-enforcing save (PUT) replaces the version reservation (#1196).
    expect(api.put).toHaveBeenCalledWith("/builder/forms/passport-renewal", {
      recipe: RECIPE,
      userLogin: "alice",
    });

    // GET open PRs (#2390) — checked before any branch is created.
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/pulls?state=open&base=dev&per_page=100&page=1",
    );
    // GET base ref (dev)
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/ref/heads/dev",
    );
    // POST create branch — versionless branch name
    const createBody = JSON.parse(
      (fetchMock.mock.calls[2][1] as RequestInit).body as string,
    );
    expect(createBody.ref).toBe(
      "refs/heads/form-builder/passport-renewal-1700000000000",
    );
    expect(createBody.sha).toBe("devsha123");
    // GET existing flat file for its blob sha
    expect(fetchMock.mock.calls[3][0]).toContain(
      "/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal.json",
    );
    // PUT overwrites the flat file in place, carrying the existing sha
    const putCall = fetchMock.mock.calls[4];
    expect(putCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal.json",
    );
    const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(putBody.branch).toBe("form-builder/passport-renewal-1700000000000");
    expect(putBody.message).toBe("Publish passport-renewal");
    expect(putBody.sha).toBe("existing-blob-sha");
    expect(Buffer.from(putBody.content, "base64").toString("utf8")).toBe(
      JSON.stringify(RECIPE, null, 2) + "\n",
    );
    // POST PR
    const prBody = JSON.parse(
      (fetchMock.mock.calls[5][1] as RequestInit).body as string,
    );
    expect(prBody.base).toBe("dev");
    expect(prBody.head).toBe("form-builder/passport-renewal-1700000000000");
    expect(prBody.title).toBe("Publish form: Passport Renewal");
    expect(prBody.body).toContain("Form ID: `passport-renewal`");
    expect(prBody.body).toContain("@alice");
  });

  it("preserves the committed createdAt on re-publish; only updatedAt advances", async () => {
    // The file already on the base branch was created earlier; the incoming
    // RECIPE carries a freshly-stamped createdAt. The published file must keep
    // the original creation date (#1720).
    const committedCreatedAt = "2025-06-17T10:50:41.039Z";
    const committed = JSON.stringify({
      ...RECIPE,
      createdAt: committedCreatedAt,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sha: "existing-blob-sha",
          content: Buffer.from(committed, "utf8").toString("base64"),
        }),
      ) // GET existing flat file (sha + content)
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      ); // POST pulls
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    const putBody = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    const written = JSON.parse(
      Buffer.from(putBody.content, "base64").toString("utf8"),
    );
    expect(written.createdAt).toBe(committedCreatedAt);
    expect(written.updatedAt).toBe(RECIPE.updatedAt);
  });

  it("carries a committed field the builder cannot author through a publish that omits it", async () => {
    // The Environmental Health routing block is passthrough-only in the
    // builder, so a stale draft publishes without it — and the Contents PUT is
    // a whole-file overwrite, which used to delete it (#2376/#2377). The
    // published file must keep the committed block.
    const catchmentRouting = {
      coordinatesField: "about-restaurant.restaurant-address-coordinates",
      parishField: "about-restaurant.restaurant-parish",
    };
    const committed = JSON.stringify({ ...RECIPE, catchmentRouting });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sha: "existing-blob-sha",
          content: Buffer.from(committed, "utf8").toString("base64"),
        }),
      ) // GET existing flat file (sha + content)
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      ); // POST pulls
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // RECIPE has no catchmentRouting — exactly the draft that dropped it.
    await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    const putBody = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    const written = JSON.parse(
      Buffer.from(putBody.content, "base64").toString("utf8"),
    );
    expect(written.catchmentRouting).toEqual(catchmentRouting);
  });

  it("lets the published payload win over the committed value, and keeps an authored field the author cleared", async () => {
    // Only fields the builder cannot author are carried forward: a payload that
    // does carry the block owns it, and clearing an authored field (here:
    // processors) stays cleared rather than being resurrected from the commit.
    const committed = JSON.stringify({
      ...RECIPE,
      catchmentRouting: {
        coordinatesField: "old.coords",
        parishField: "old.parish",
      },
      processors: [{ type: "email", config: { recipientField: "a.b" } }],
    });
    const incoming = {
      ...RECIPE,
      catchmentRouting: {
        coordinatesField: "new.coords",
        parishField: "new.parish",
      },
    } as ServiceContractRecipe;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sha: "existing-blob-sha",
          content: Buffer.from(committed, "utf8").toString("base64"),
        }),
      ) // GET existing flat file (sha + content)
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      ); // POST pulls
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    (api.post as Mock).mockResolvedValue({ ok: true, data: incoming });
    await publishRecipe({
      data: { recipe: incoming, description: "" },
      context: { session: SESSION },
    });

    const putBody = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    const written = JSON.parse(
      Buffer.from(putBody.content, "base64").toString("utf8"),
    );
    expect(written.catchmentRouting.coordinatesField).toBe("new.coords");
    expect(written.processors).toBeUndefined();
  });

  it("stamps a fresh createdAt on first publish (no existing file)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(emptyResponse(404)) // GET existing flat file — absent
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      ); // POST pulls
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    const putBody = JSON.parse(
      (fetchMock.mock.calls[4][1] as RequestInit).body as string,
    );
    // No existing file → no sha, recipe written verbatim with its minted stamps.
    expect(putBody.sha).toBeUndefined();
    expect(Buffer.from(putBody.content, "base64").toString("utf8")).toBe(
      JSON.stringify(RECIPE, null, 2) + "\n",
    );
  });

  it("validates against the API before touching GitHub or saving", async () => {
    (api.post as Mock).mockResolvedValue({
      ok: false,
      issues: [{ path: "steps", message: "no steps" }],
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({
        data: { recipe: RECIPE, description: "" },
        context: { session: SESSION },
      }),
    ).rejects.toThrow(/validation failed/i);
    expect(api.put).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a read-only-lock conflict (409 on the save) and never touches GitHub", async () => {
    (api.put as Mock).mockRejectedValue(new ApiError(409, "conflict"));
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({
        data: { recipe: RECIPE, description: "" },
        context: { session: SESSION },
      }),
    ).rejects.toThrow(/another editor holds this form/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the branch when the contents PUT fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(noOpenPRs()) // GET open PRs — none match
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "x" }))
      .mockResolvedValueOnce(jsonResponse(200, { sha: "blob" }))
      .mockResolvedValueOnce(emptyResponse(422)) // PUT fails
      .mockResolvedValueOnce(emptyResponse(204)); // DELETE branch cleanup
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({
        data: { recipe: RECIPE, description: "" },
        context: { session: SESSION },
      }),
    ).rejects.toThrow(/failed to write recipe file/i);
    const del = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(del?.[0]).toContain(
      "/git/refs/heads/form-builder/passport-renewal-",
    );
  });

  it("uses PUBLISH_BASE_BRANCH for the base ref and PR base when set", async () => {
    process.env.PUBLISH_BASE_BRANCH = "sandbox";
    const fetchMock = happyFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    expect(fetchMock.mock.calls[1][0]).toContain("/git/ref/heads/sandbox");
    const prBody = JSON.parse(
      (fetchMock.mock.calls[5][1] as RequestInit).body as string,
    );
    expect(prBody.base).toBe("sandbox");
  });

  // ---------------------------------------------------------------------
  // #2390 — reuse an already-open Deploy PR instead of opening a duplicate.
  // ---------------------------------------------------------------------

  it("reuses an already-open Deploy PR for this form: pushes onto its branch and comments, without creating a new branch", async () => {
    const fetchMock = vi
      .fn()
      // GET open PRs — one already open for this exact form
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      )
      // GET the recipe file on the PR's branch, for its blob sha
      .mockResolvedValueOnce(jsonResponse(200, { sha: "pr-blob-sha" }))
      // PUT contents onto the PR's branch
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c2" } }))
      // POST a PR comment with the author's description
      .mockResolvedValueOnce(jsonResponse(201, { id: 1 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      data: { recipe: RECIPE, description: "Bumped a copy typo" },
      context: { session: SESSION },
    });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/17",
      prNumber: 17,
      updatedExistingPR: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // No branch was created for the reuse path.
    const createBranchCall = fetchMock.mock.calls.find(
      (c) => c[0] === "https://api.github.com/repos/govtech-bb/gov-bb/git/refs",
    );
    expect(createBranchCall).toBeUndefined();

    // The write targets the existing PR's branch, not a fresh one.
    expect(fetchMock.mock.calls[1][0]).toContain(
      "/contents/apps/api/src/forms/form-definitions/recipes/passport-renewal.json",
    );
    const putCall = fetchMock.mock.calls[2];
    const putBody = JSON.parse((putCall[1] as RequestInit).body as string);
    expect(putBody.branch).toBe("form-builder/passport-renewal-1699999999999");
    expect(putBody.sha).toBe("pr-blob-sha");

    // The description is posted as a PR comment crediting the author, with no
    // injected timestamp (GitHub timestamps comments itself).
    const commentCall = fetchMock.mock.calls[3];
    expect(commentCall[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/issues/17/comments",
    );
    const commentBody = JSON.parse(
      (commentCall[1] as RequestInit).body as string,
    );
    expect(commentBody.body).toContain(
      "Re-deployed from the form builder by @alice",
    );
    expect(commentBody.body).toContain("Bumped a copy typo");
  });

  // This is the regression the whole ticket hinges on: deployBranchPrefix's
  // naive `startsWith` would have let "passport" match
  // "form-builder/passport-renewal-<ts>" and push the wrong recipe onto the
  // sibling form's PR.
  it("carries a field the builder cannot author when reusing an open PR, too", async () => {
    // The reuse path is also a whole-file Contents overwrite, so it needs the
    // same passthrough the create path got in #2377 — otherwise redeploying
    // onto an open PR would delete catchmentRouting exactly the way the
    // original bug did, on a brand-new code path (#2390).
    const catchmentRouting = {
      coordinatesField: "about-restaurant.restaurant-address-coordinates",
      parishField: "about-restaurant.restaurant-parish",
    };
    const committed = JSON.stringify({ ...RECIPE, catchmentRouting });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      ) // GET open PRs — one already open for this form
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sha: "pr-blob-sha",
          content: Buffer.from(committed, "utf8").toString("base64"),
        }),
      ) // GET the recipe on the PR branch (sha + content)
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c2" } })); // PUT
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // RECIPE carries no catchmentRouting — the stale-draft case.
    await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    const putBody = JSON.parse(
      (fetchMock.mock.calls[2][1] as RequestInit).body as string,
    );
    const written = JSON.parse(
      Buffer.from(putBody.content, "base64").toString("utf8"),
    );
    expect(written.catchmentRouting).toEqual(catchmentRouting);
  });

  it("sibling-branch guard: formId 'passport' must not reuse the open PR for 'passport-renewal'", async () => {
    const siblingRecipe: ServiceContractRecipe = {
      ...RECIPE,
      formId: "passport",
      title: "Passport",
    };
    const fetchMock = vi
      .fn()
      // GET open PRs — only "passport-renewal"'s PR is open, not "passport"'s
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      ) // GET base ref
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" })) // POST create branch
      .mockResolvedValueOnce(emptyResponse(404)) // GET existing flat file for "passport" — none yet
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } })) // PUT contents
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 43,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/43",
        }),
      ); // POST pulls — its own new PR
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      data: { recipe: siblingRecipe, description: "" },
      context: { session: SESSION },
    });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/43",
      prNumber: 43,
      updatedExistingPR: false,
    });

    // Its own branch was created — "passport" did not piggyback on
    // "passport-renewal"'s PR.
    const createBody = JSON.parse(
      (fetchMock.mock.calls[2][1] as RequestInit).body as string,
    );
    expect(createBody.ref).toBe(
      "refs/heads/form-builder/passport-1700000000000",
    );
  });

  it("an open Erase PR for this form does not satisfy the Deploy-PR lookup", async () => {
    const fetchMock = vi
      .fn()
      // GET open PRs — only an Erase PR is open for this form
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(5, "form-builder/erase-passport-renewal-1699999999999"),
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { ref: "refs/heads/x" }))
      .mockResolvedValueOnce(jsonResponse(200, { sha: "existing-blob-sha" }))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          number: 42,
          html_url: "https://github.com/govtech-bb/gov-bb/pull/42",
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      data: { recipe: RECIPE, description: "" },
      context: { session: SESSION },
    });

    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/42",
      prNumber: 42,
      updatedExistingPR: false,
    });
  });

  it("posts no PR comment when the description is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { sha: "pr-blob-sha" }))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c2" } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishRecipe({
      // Whitespace-only trims to empty — carries no information a comment
      // would add.
      data: { recipe: RECIPE, description: "   " },
      context: { session: SESSION },
    });

    expect(result.updatedExistingPR).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3); // no comment POST
  });

  it("resolves the reuse deploy successfully even when the PR comment POST fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { sha: "pr-blob-sha" }))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c2" } }))
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" })); // comment POST fails
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await publishRecipe({
      data: { recipe: RECIPE, description: "Fixed a typo" },
      context: { session: SESSION },
    });

    // The recipe is already committed by this point — a failed comment must
    // never fail a deploy that already succeeded.
    expect(result).toEqual({
      prUrl: "https://github.com/govtech-bb/gov-bb/pull/17",
      prNumber: 17,
      updatedExistingPR: true,
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not DELETE the existing PR's branch when the reuse-path write fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(200, { sha: "pr-blob-sha" }))
      .mockResolvedValueOnce(emptyResponse(422)); // PUT fails
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({
        data: { recipe: RECIPE, description: "" },
        context: { session: SESSION },
      }),
    ).rejects.toThrow(/failed to write recipe file/i);

    // Deleting an already-open PR's branch would close that PR and destroy
    // the review — the reuse path must never do it.
    const del = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    );
    expect(del).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("listOpenDeployPRs", () => {
  it("maps open Deploy branches to their formId, dropping Erase and non-Deploy refs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, [
          openPR(17, "form-builder/passport-renewal-1699999999999"),
          openPR(5, "form-builder/erase-passport-renewal-1699999999999"),
          openPR(9, "start-page-some-service-1699999999999"),
        ]),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await listOpenDeployPRs({ context: { session: SESSION } });

    expect(result).toEqual([
      {
        formId: "passport-renewal",
        prNumber: 17,
        prUrl: "https://github.com/govtech-bb/gov-bb/pull/17",
        branch: "form-builder/passport-renewal-1699999999999",
      },
    ]);
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
    (api.get as Mock).mockResolvedValue([]);
  });

  it("opens a single-commit folder-delete PR on the happy path", async () => {
    const fetchMock = vi
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

    const result = await eraseRecipe({
      data: ERASE,
      context: { session: SESSION },
    });

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
    (api.get as Mock).mockResolvedValue(["passport-renewal"]);
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      eraseRecipe({ data: ERASE, context: { session: SESSION } }),
    ).rejects.toThrow(/disabled/i);

    // The disabled gate fires before any GitHub call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses (no branch, no PR) when the folder has no versions to erase", async () => {
    const fetchMock = vi
      .fn()
      // listVersions: empty folder (404 -> [])
      .mockResolvedValueOnce(emptyResponse(404));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      eraseRecipe({ data: ERASE, context: { session: SESSION } }),
    ).rejects.toThrow(/nothing to erase/i);

    // Only the listing was attempted — no branch created.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up the branch when tree creation fails", async () => {
    const fetchMock = vi
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

    await expect(
      eraseRecipe({ data: ERASE, context: { session: SESSION } }),
    ).rejects.toThrow(/Failed to create tree/);

    const cleanup = fetchMock.mock.calls[5];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/erase-passport-renewal-1700000000000",
    );
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("does not attempt cleanup when branch creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, dirListing(["1.0.0"])))
      .mockResolvedValueOnce(
        jsonResponse(200, { object: { sha: "devsha123" } }),
      )
      // create branch fails
      .mockResolvedValueOnce(jsonResponse(422, { message: "ref exists" }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      eraseRecipe({ data: ERASE, context: { session: SESSION } }),
    ).rejects.toThrow(/Failed to create branch/);

    // No DELETE — the branch was never created.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("erases on the configured PUBLISH_BASE_BRANCH when set", async () => {
    process.env.PUBLISH_BASE_BRANCH = "sandbox";
    const fetchMock = vi
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

    await eraseRecipe({ data: ERASE, context: { session: SESSION } });

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
    const fetchMock = vi
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

    await expect(
      eraseRecipe({ data: ERASE, context: { session: SESSION } }),
    ).rejects.toThrow(/Failed to open pull request/);

    const cleanup = fetchMock.mock.calls[8];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/erase-passport-renewal-1700000000000",
    );
    expect((cleanup[1] as RequestInit).method).toBe("DELETE");
  });

  it("rejects an empty reason without consulting the disabled index or GitHub", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    // The reason is the audit trail for a permanent delete — the server (not
    // just the bypassable client modal) must require it.
    await expect(
      eraseRecipe({
        data: { ...ERASE, reason: "" },
        context: { session: SESSION },
      }),
    ).rejects.toThrow();

    expect(api.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
// ---------------------------------------------------------------------------
// formId path-injection guard (#293) — a crafted formId must be rejected before
// any GitHub/backend call so it can never reach a request path or branch name.
// ---------------------------------------------------------------------------
describe("formId validation (#293)", () => {
  const TRAVERSAL_ID = "../../../.github/workflows/evil";

  it("publishRecipe rejects a traversal formId before any GitHub/API call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      publishRecipe({
        data: { recipe: { ...RECIPE, formId: TRAVERSAL_ID }, description: "" },
      }),
    ).rejects.toThrow(/Invalid form ID/);

    // The remote /validate call, the reservation, and every GitHub fetch are
    // all downstream of the guard — none should have run.
    expect(api.post).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("eraseRecipe rejects a traversal formId before any GitHub/API call", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      eraseRecipe({
        data: { formId: TRAVERSAL_ID, title: "Evil", reason: "because" },
      }),
    ).rejects.toThrow(/lowercase letters/i);

    expect(api.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
