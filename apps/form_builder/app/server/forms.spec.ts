import { listForms, getRecipe } from "./forms";
import * as githubRecipes from "./github-recipes";
import * as session from "./session-cipher.server";
import * as db from "./db";

// Stub out @govtech-bb/database so Jest never resolves the real typeorm chain
// (typeorm → sha.js → typed-array-buffer → get-proto → dunder-proto).
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
jest.mock("./github-recipes");
jest.mock("./session-cipher.server");
jest.mock("./db", () => ({ getDataSource: jest.fn() }));
jest.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));

type DraftRow = {
  id: string;
  form_id: string;
  title: string | null;
  version: string;
  schema: unknown;
};

// Wires getDataSource to a query mock. queue lets each call return a different
// result set in order (listForms makes one call; getRecipe makes one).
function mockDataSource(queue: unknown[][]): jest.Mock {
  const query = jest.fn();
  for (const result of queue) query.mockResolvedValueOnce(result);
  (db.getDataSource as jest.Mock).mockResolvedValue({ query });
  return query;
}

function recipe(formId: string, version: string) {
  return {
    formId,
    title: formId,
    version,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    steps: [],
  };
}

describe("forms server functions — listForms and getRecipe", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
    (session.getSession as jest.Mock).mockReturnValue({
      login: "alice",
      accessToken: "ghu_test",
      expiresAt: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
    delete process.env.SESSION_SECRET;
  });

  describe("listForms", () => {
    it("returns GitHub-published forms when there are no drafts", async () => {
      mockDataSource([[] as DraftRow[]]);
      (githubRecipes.listPublishedForms as jest.Mock).mockResolvedValue([
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.1.0",
        },
      ]);

      const result = await listForms();

      expect(githubRecipes.listPublishedForms).toHaveBeenCalledWith("ghu_test");
      expect(result).toEqual([
        {
          id: "passport-renewal",
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.1.0",
          isPublished: true,
        },
      ]);
    });

    it("returns DB drafts when GitHub has nothing", async () => {
      mockDataSource([
        [
          {
            id: "row-1",
            form_id: "new-form",
            title: "New Form",
            version: "1.0.0",
            schema: recipe("new-form", "1.0.0"),
          },
        ] as DraftRow[],
      ]);
      (githubRecipes.listPublishedForms as jest.Mock).mockResolvedValue([]);

      const result = await listForms();

      expect(result).toEqual([
        {
          id: "row-1",
          formId: "new-form",
          title: "New Form",
          version: "1.0.0",
          isPublished: false,
        },
      ]);
    });

    it("prefers the higher version when the same formId is in both", async () => {
      mockDataSource([
        [
          {
            id: "row-1",
            form_id: "passport",
            title: "Passport",
            version: "1.2.0",
            schema: recipe("passport", "1.2.0"),
          },
        ] as DraftRow[],
      ]);
      (githubRecipes.listPublishedForms as jest.Mock).mockResolvedValue([
        { formId: "passport", title: "Passport", version: "1.1.0" },
      ]);

      const result = await listForms();

      expect(result).toEqual([
        {
          id: "row-1",
          formId: "passport",
          title: "Passport",
          version: "1.2.0",
          isPublished: false,
        },
      ]);
    });

    it("marks the form published when versions tie", async () => {
      mockDataSource([
        [
          {
            id: "row-1",
            form_id: "passport",
            title: "Passport",
            version: "1.1.0",
            schema: recipe("passport", "1.1.0"),
          },
        ] as DraftRow[],
      ]);
      (githubRecipes.listPublishedForms as jest.Mock).mockResolvedValue([
        { formId: "passport", title: "Passport", version: "1.1.0" },
      ]);

      const result = await listForms();

      expect(result).toEqual([
        {
          id: "passport",
          formId: "passport",
          title: "Passport",
          version: "1.1.0",
          isPublished: true,
        },
      ]);
    });

    it("throws when there is no session", async () => {
      (session.getSession as jest.Mock).mockReturnValue(null);
      await expect(listForms()).rejects.toThrow(/not authenticated/i);
    });
  });

  describe("requireToken — SESSION_SECRET missing", () => {
    beforeEach(() => {
      delete process.env.SESSION_SECRET;
      (session.getSession as jest.Mock).mockReturnValue({
        login: "alice",
        accessToken: "ghu_test",
        expiresAt: Date.now() + 60_000,
      });
    });

    it("throws when SESSION_SECRET is not set", async () => {
      await expect(listForms()).rejects.toThrow(/SESSION_SECRET/i);
    });
  });

  describe("getRecipe", () => {
    it("returns the published recipe when no draft exists", async () => {
      mockDataSource([[]]);
      const ghRecipe = recipe("passport-renewal", "1.1.0");
      (githubRecipes.getPublishedRecipe as jest.Mock).mockResolvedValue(
        ghRecipe,
      );

      const result = await getRecipe({ data: { formId: "passport-renewal" } });

      expect(githubRecipes.getPublishedRecipe).toHaveBeenCalledWith(
        "ghu_test",
        {
          formId: "passport-renewal",
        },
      );
      expect(result).toEqual(ghRecipe);
    });

    it("returns the draft when no published copy exists", async () => {
      const draftRecipe = recipe("new-form", "1.0.0");
      mockDataSource([
        [
          {
            id: "row-1",
            version: "1.0.0",
            schema: draftRecipe,
            published_at: null,
          },
        ],
      ]);
      (githubRecipes.getPublishedRecipe as jest.Mock).mockRejectedValue(
        new Error("not found"),
      );

      const result = await getRecipe({ data: { formId: "new-form" } });
      expect(result).toEqual(draftRecipe);
    });

    it("returns the draft when it has a higher version than the published copy", async () => {
      const draftRecipe = recipe("passport", "1.2.0");
      mockDataSource([
        [
          {
            id: "row-1",
            version: "1.2.0",
            schema: draftRecipe,
            published_at: null,
          },
        ],
      ]);
      (githubRecipes.getPublishedRecipe as jest.Mock).mockResolvedValue(
        recipe("passport", "1.1.0"),
      );

      const result = await getRecipe({ data: { formId: "passport" } });
      expect(result).toEqual(draftRecipe);
    });

    it("throws when there is no session", async () => {
      (session.getSession as jest.Mock).mockReturnValue(null);
      await expect(
        getRecipe({ data: { formId: "passport-renewal" } }),
      ).rejects.toThrow(/not authenticated/i);
    });
  });
});
