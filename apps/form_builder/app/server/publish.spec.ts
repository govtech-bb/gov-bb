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

import { getSession } from "./session-cipher.server";
import { publishRecipe } from "./publish";

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
  (getSession as jest.Mock).mockReturnValue(SESSION);
  // Freeze "now" so branch names are deterministic.
  jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SESSION_SECRET;
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
      ref: "refs/heads/form-builder/passport-renewal-1.2.0-1700000000000",
      sha: "devsha123",
    });

    // Step 3: contents GET on the new branch
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/recipes/passport-renewal/1.2.0.json?ref=form-builder%2Fpassport-renewal-1.2.0-1700000000000",
    );

    // Step 4: PUT with base64 content and matching message
    const step4 = fetchMock.mock.calls[3];
    expect(step4[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/contents/recipes/passport-renewal/1.2.0.json",
    );
    const step4Body = JSON.parse((step4[1] as RequestInit).body as string);
    expect(step4Body.branch).toBe(
      "form-builder/passport-renewal-1.2.0-1700000000000",
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
      "form-builder/passport-renewal-1.2.0-1700000000000",
    );
    expect(step5Body.title).toBe("Publish form: Passport Renewal v1.2.0");
    expect(step5Body.body).toContain("Form ID: `passport-renewal`");
    expect(step5Body.body).toContain("Version: `1.2.0`");
    expect(step5Body.body).toContain("@alice");
    expect(step5Body.body).toContain("Adds passport-renewal v1.2.0");
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
      /Version 1\.2\.0 already exists in dev\. Bump the version and try again\./,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const cleanup = fetchMock.mock.calls[3];
    expect(cleanup[0]).toBe(
      "https://api.github.com/repos/govtech-bb/gov-bb/git/refs/heads/form-builder/passport-renewal-1.2.0-1700000000000",
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
