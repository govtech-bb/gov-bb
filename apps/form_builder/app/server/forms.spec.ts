import { listForms, getRecipe } from "./forms";
import * as githubRecipes from "./github-recipes";
import * as session from "./session-cipher.server";

// Stub out @govtech-bb/database so Jest never resolves the real typeorm chain
// (typeorm → sha.js → typed-array-buffer → get-proto → dunder-proto).
jest.mock("@govtech-bb/database", () => ({
  FormDefinitionEntity: class FormDefinitionEntity {},
}));
jest.mock("./github-recipes");
jest.mock("./session-cipher.server");
// Avoid pulling in the real DB module — the only paths these tests touch are
// the GitHub branches; DB-backed legacy functions are tested separately.
jest.mock("./db", () => ({ getDataSource: jest.fn() }));
jest.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));

describe("forms server functions — GitHub-backed reads", () => {
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
    it("delegates to listPublishedForms and adapts the shape", async () => {
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
    it("delegates to getPublishedRecipe", async () => {
      const recipe = {
        formId: "passport-renewal",
        title: "X",
        version: "1.1.0",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        steps: [],
      };
      (githubRecipes.getPublishedRecipe as jest.Mock).mockResolvedValue(recipe);

      const result = await getRecipe({ data: { formId: "passport-renewal" } });

      expect(githubRecipes.getPublishedRecipe).toHaveBeenCalledWith(
        "ghu_test",
        {
          formId: "passport-renewal",
        },
      );
      expect(result).toEqual(recipe);
    });

    it("throws when there is no session", async () => {
      (session.getSession as jest.Mock).mockReturnValue(null);
      await expect(
        getRecipe({ data: { formId: "passport-renewal" } }),
      ).rejects.toThrow(/not authenticated/i);
    });
  });
});
