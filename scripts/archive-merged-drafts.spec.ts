import {
  parseAddedRecipePaths,
  selectDraftsToArchive,
  archiveDrafts,
  resolveArchiveConfig,
} from "./archive-merged-drafts";

const RECIPES = "apps/api/src/forms/form-definitions/recipes";

// #2878: a recipe change that only moved `updatedAt` — the stamp backfill, a
// page-only service publication — must not expire the form's builder draft.
describe("selectDraftsToArchive", () => {
  const BEFORE = "a".repeat(40);
  const AFTER = "b".repeat(40);
  const recipe = {
    formId: "passport-renewal",
    title: "Passport Renewal",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
  };
  const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
  const path = `${RECIPES}/passport-renewal.json`;

  function select(blobs: Record<string, string | null>) {
    const log: string[] = [];
    const readBlob = vi.fn(
      (sha: string, p: string) => blobs[`${sha}:${p}`] ?? null,
    );
    const kept = selectDraftsToArchive([{ formId: "passport-renewal" }], {
      before: BEFORE,
      after: AFTER,
      readBlob,
      log: (msg) => log.push(msg),
    });
    return { kept, log, readBlob };
  }

  it("skips a modification that only moved updatedAt, and says so", () => {
    const { kept, log, readBlob } = select({
      [`${BEFORE}:${path}`]: json(recipe),
      [`${AFTER}:${path}`]: json({
        ...recipe,
        updatedAt: "2026-09-18T18:21:48.000Z",
      }),
    });
    expect(kept).toEqual([]);
    expect(
      log.some((m) => /passport-renewal/.test(m) && /updatedAt/.test(m)),
    ).toBe(true);
    expect(readBlob).toHaveBeenCalledWith(BEFORE, path);
    expect(readBlob).toHaveBeenCalledWith(AFTER, path);
  });

  it("archives a modification that changed the recipe's content", () => {
    const { kept } = select({
      [`${BEFORE}:${path}`]: json(recipe),
      [`${AFTER}:${path}`]: json({
        ...recipe,
        title: "Renew a passport",
        updatedAt: "2026-09-18T18:21:48.000Z",
      }),
    });
    expect(kept).toEqual([{ formId: "passport-renewal" }]);
  });

  it("archives an added recipe (no blob before the push)", () => {
    const { kept } = select({ [`${AFTER}:${path}`]: json(recipe) });
    expect(kept).toEqual([{ formId: "passport-renewal" }]);
  });

  it("archives when a blob does not parse, as before", () => {
    const { kept } = select({
      [`${BEFORE}:${path}`]: "{ not json",
      [`${AFTER}:${path}`]: json(recipe),
    });
    expect(kept).toEqual([{ formId: "passport-renewal" }]);
  });
});

describe("parseAddedRecipePaths", () => {
  it("extracts {formId} from flat canonical recipe paths", () => {
    const paths = [
      `${RECIPES}/passport-renewal.json`,
      `${RECIPES}/drivers-licence.json`,
    ];
    expect(parseAddedRecipePaths(paths)).toEqual([
      { formId: "passport-renewal" },
      { formId: "drivers-licence" },
    ]);
  });

  it("ignores non-recipe paths and the retained legacy versioned files", () => {
    const paths = [
      `${RECIPES}/passport-renewal.json`,
      "README.md",
      `${RECIPES}/.gitkeep`,
      // Legacy versioned fallback files are frozen — never re-archived.
      `${RECIPES}/passport-renewal/1.2.0.json`,
      "src/foo.ts",
    ];
    expect(parseAddedRecipePaths(paths)).toEqual([
      { formId: "passport-renewal" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseAddedRecipePaths([])).toEqual([]);
  });
});

describe("archiveDrafts", () => {
  it("POSTs to /admin/drafts/{formId}/archive for each entry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const log: string[] = [];

    await archiveDrafts(
      [{ formId: "passport-renewal" }, { formId: "drivers-licence" }],
      {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
        log: (msg) => log.push(msg),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/admin/drafts/passport-renewal/archive",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    expect(log.some((m) => m.includes("204"))).toBe(true);
  });

  it("treats 404 as success (idempotent retries)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const log: string[] = [];

    await expect(
      archiveDrafts([{ formId: "ghost" }], {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
        log: (msg) => log.push(msg),
      }),
    ).resolves.toEqual([]);

    expect(log.some((m) => /404/.test(m))).toBe(true);
  });

  it("does NOT throw on a non-204/404 response, but logs a warning and reports the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("oops", { status: 500 }));
    const log: string[] = [];

    await expect(
      archiveDrafts([{ formId: "passport-renewal" }], {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
        log: (msg) => log.push(msg),
      }),
    ).resolves.toEqual([{ formId: "passport-renewal", reason: "HTTP 500" }]);

    expect(log.some((m) => /WARN/i.test(m) && /500/.test(m))).toBe(true);
  });

  it.each([401, 403])(
    "reports a rejected token (%i) as a failure, not a success",
    async (status) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status }));

      await expect(
        archiveDrafts([{ formId: "passport-renewal" }], {
          apiUrl: "https://api.example.com",
          token: "wrong",
          fetch: fetchMock as unknown as typeof fetch,
          sleep: async () => {},
          log: () => {},
        }),
      ).resolves.toEqual([
        { formId: "passport-renewal", reason: `HTTP ${status}` },
      ]);
    },
  );

  it("reports a request that never reached the API, and still tries the rest", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      archiveDrafts([{ formId: "first" }, { formId: "second" }], {
        apiUrl: "https://wrong-host.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        sleep: async () => {},
        log: () => {},
      }),
    ).resolves.toEqual([
      { formId: "first", reason: "request failed: getaddrinfo ENOTFOUND" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("spaces requests 2 s apart, not before the first", async () => {
    const sleep = vi.fn(async () => {});
    await archiveDrafts([{ formId: "first" }, { formId: "second" }], {
      apiUrl: "https://api.example.com",
      token: "secret",
      fetch: vi.fn(
        async () => new Response(null, { status: 204 }),
      ) as unknown as typeof fetch,
      sleep,
      log: () => {},
    });
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("calls fetch zero times when there are no entries", async () => {
    const fetchMock = vi.fn();
    await archiveDrafts([], {
      apiUrl: "https://api.example.com",
      token: "secret",
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
      log: () => {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // #2409: the API throttles to 5 requests / 10 s, so a push touching more
  // recipes than that gets 429 for the rest.
  describe("on 429", () => {
    function run(responses: Response[]) {
      const fetchMock = vi.fn();
      for (const r of responses) fetchMock.mockResolvedValueOnce(r);
      const sleep = vi.fn(async () => {});
      const result = archiveDrafts([{ formId: "passport-renewal" }], {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        log: () => {},
        sleep,
      });
      return { result, fetchMock, sleep };
    }
    const tooMany = (headers?: Record<string, string>) =>
      new Response(null, { status: 429, headers });

    it("waits the throttler's Retry-After-short seconds and retries the same form", async () => {
      const { result, fetchMock, sleep } = run([
        tooMany({ "Retry-After-short": "3" }),
        new Response(null, { status: 204 }),
      ]);
      await expect(result).resolves.toEqual([]);
      expect(sleep).toHaveBeenCalledOnce();
      expect(sleep).toHaveBeenCalledWith(3000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("waits the longest Retry-After* header when several throttlers fire", async () => {
      const { result, sleep } = run([
        tooMany({ "Retry-After-short": "3", "Retry-After-medium": "42" }),
        new Response(null, { status: 204 }),
      ]);
      await expect(result).resolves.toEqual([]);
      expect(sleep).toHaveBeenCalledWith(42000);
    });

    it("waits 10 s when there is no Retry-After header", async () => {
      const { result, sleep } = run([
        tooMany(),
        new Response(null, { status: 204 }),
      ]);
      await expect(result).resolves.toEqual([]);
      expect(sleep).toHaveBeenCalledWith(10000);
    });

    it("gives up after 3 retries and reports the failure once", async () => {
      const { result, fetchMock } = run([
        tooMany(),
        tooMany(),
        tooMany(),
        tooMany(),
      ]);
      await expect(result).resolves.toEqual([
        { formId: "passport-renewal", reason: "HTTP 429" },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("does not retry any other status", async () => {
      const { result, fetchMock, sleep } = run([
        new Response(null, { status: 500 }),
        new Response(null, { status: 204 }),
      ]);
      await expect(result).resolves.toEqual([
        { formId: "passport-renewal", reason: "HTTP 500" },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    });
  });
});

describe("resolveArchiveConfig", () => {
  it("returns the config when both secrets are set", () => {
    expect(
      resolveArchiveConfig({
        API_URL: "https://api.example.com",
        ARCHIVE_DRAFTS_TOKEN: "secret",
      }),
    ).toEqual({ apiUrl: "https://api.example.com", token: "secret" });
  });

  it("skips and names the ARCHIVE_DRAFTS_API_URL secret when API_URL is missing", () => {
    const result = resolveArchiveConfig({ ARCHIVE_DRAFTS_TOKEN: "secret" });
    expect(result).toEqual({ skip: expect.any(String) });
    expect("skip" in result && result.skip).toContain("ARCHIVE_DRAFTS_API_URL");
  });

  it("skips and names the ARCHIVE_DRAFTS_TOKEN secret when the token is missing", () => {
    const result = resolveArchiveConfig({ API_URL: "https://api.example.com" });
    expect("skip" in result && result.skip).toContain("ARCHIVE_DRAFTS_TOKEN");
  });

  it("treats an empty string as missing (not a valid secret)", () => {
    const result = resolveArchiveConfig({
      API_URL: "",
      ARCHIVE_DRAFTS_TOKEN: "secret",
    });
    expect("skip" in result && result.skip).toContain("ARCHIVE_DRAFTS_API_URL");
  });
});
