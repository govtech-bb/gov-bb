import { parseAddedRecipePaths, archiveDrafts } from "./archive-merged-drafts";

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
    const fetchMock = jest
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
        headers: expect.objectContaining({ "x-admin-token": "secret" }),
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
      archiveDrafts([{ formId: "ghost" }], {
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
      archiveDrafts([{ formId: "passport-renewal" }], {
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
