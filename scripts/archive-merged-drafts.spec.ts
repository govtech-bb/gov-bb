import {
  parseAddedRecipePaths,
  archiveDrafts,
  resolveArchiveConfig,
} from "./archive-merged-drafts";

const RECIPES = "apps/api/src/forms/form-definitions/recipes";

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
        log: () => {},
      }),
    ).resolves.toEqual([
      { formId: "first", reason: "request failed: getaddrinfo ENOTFOUND" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls fetch zero times when there are no entries", async () => {
    const fetchMock = vi.fn();
    await archiveDrafts([], {
      apiUrl: "https://api.example.com",
      token: "secret",
      fetch: fetchMock as unknown as typeof fetch,
      log: () => {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
