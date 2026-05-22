import { parseAddedRecipePaths, archiveDrafts } from "./archive-merged-drafts";

describe("parseAddedRecipePaths", () => {
  it("extracts {formId, version} from valid recipe paths", () => {
    const paths = [
      "recipes/passport-renewal/1.2.0.json",
      "recipes/drivers-licence/2.0.0.json",
    ];
    expect(parseAddedRecipePaths(paths)).toEqual([
      { formId: "passport-renewal", version: "1.2.0" },
      { formId: "drivers-licence", version: "2.0.0" },
    ]);
  });

  it("ignores paths not under recipes/ or with the wrong shape", () => {
    const paths = [
      "recipes/passport-renewal/1.2.0.json",
      "README.md",
      "recipes/.gitkeep",
      "recipes/passport-renewal/notes.txt",
      "recipes/passport-renewal/sub/1.0.0.json",
      "src/foo.ts",
    ];
    expect(parseAddedRecipePaths(paths)).toEqual([
      { formId: "passport-renewal", version: "1.2.0" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseAddedRecipePaths([])).toEqual([]);
  });
});

describe("archiveDrafts", () => {
  it("POSTs to /admin/drafts/{formId}/{version}/archive for each entry", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const log: string[] = [];

    await archiveDrafts(
      [
        { formId: "passport-renewal", version: "1.2.0" },
        { formId: "drivers-licence", version: "2.0.0" },
      ],
      {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        log: (msg) => log.push(msg),
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/admin/drafts/passport-renewal/1.2.0/archive",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
    expect(log.some((m) => m.includes("204"))).toBe(true);
  });

  it("treats 404 as success (idempotent retries)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    const log: string[] = [];

    await expect(
      archiveDrafts([{ formId: "ghost", version: "1.0.0" }], {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        log: (msg) => log.push(msg),
      }),
    ).resolves.toBeUndefined();

    expect(log.some((m) => /404/.test(m))).toBe(true);
  });

  it("does NOT throw on a non-204/404 response, but logs a warning (best-effort)", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response("oops", { status: 500 }));
    const log: string[] = [];

    await expect(
      archiveDrafts([{ formId: "passport-renewal", version: "1.2.0" }], {
        apiUrl: "https://api.example.com",
        token: "secret",
        fetch: fetchMock as unknown as typeof fetch,
        log: (msg) => log.push(msg),
      }),
    ).resolves.toBeUndefined();

    expect(log.some((m) => /WARN/i.test(m) && /500/.test(m))).toBe(true);
  });

  it("calls fetch zero times when there are no entries", async () => {
    const fetchMock = jest.fn();
    await archiveDrafts([], {
      apiUrl: "https://api.example.com",
      token: "secret",
      fetch: fetchMock as unknown as typeof fetch,
      log: () => {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
