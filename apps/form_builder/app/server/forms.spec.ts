/**
 * @jest-environment node
 */
import type { FormDefinitionSummary } from "../types/index";

// Mock the auth surface before importing the SUT — the requireSession
// middleware reads SESSION_SECRET + a session cookie and would otherwise
// throw under jsdom-free jest. Matches the pattern in publish.spec.ts.
jest.mock("./session-cipher.server", () => ({
  getSession: jest.fn(),
}));
jest.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
jest.mock("./api-client", () => {
  const ApiError = class extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  };
  return {
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), del: jest.fn() },
    ApiError,
  };
});

// getRecipe resolves the published copy through getPublishedRecipe; mock it so
// the precedence tests don't hit GitHub.
jest.mock("./github-recipes", () => ({
  getPublishedRecipe: jest.fn(),
}));

import { getSession } from "./session-cipher.server";
import { api, ApiError } from "./api-client";
import { getPublishedRecipe } from "./github-recipes";
import { listForms, getRecipe } from "./forms";

const getPublishedRecipeMock = getPublishedRecipe as jest.Mock;

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

const apiGet = api.get as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  (getSession as jest.Mock).mockReturnValue(SESSION);
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
});

describe("listForms", () => {
  it("fetches drafts, published, and disabled from the form_builder_api endpoints", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve([]);
      if (path === "/builder/forms/published") return Promise.resolve([]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    await listForms();

    const paths = apiGet.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/builder/forms",
        "/builder/forms/published",
        "/builder/forms/disabled",
      ]),
    );
  });

  it("merges drafts and published, returning one entry per formId", async () => {
    const drafts: FormDefinitionSummary[] = [
      {
        id: "uuid-1",
        formId: "passport-renewal",
        title: "Passport Renewal (draft)",
        version: "1.1.0",
        isPublished: false,
      },
    ];
    const published = [
      { formId: "drivers-licence", title: "Drivers Licence", version: "1.0.0" },
    ];

    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve(drafts);
      if (path === "/builder/forms/published")
        return Promise.resolve(published);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          formId: "passport-renewal",
          version: "1.1.0",
          isPublished: false,
        }),
        expect.objectContaining({
          formId: "drivers-licence",
          version: "1.0.0",
          isPublished: true,
        }),
      ]),
    );
  });

  it("prefers the published entry when its version is newer than the draft", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "passport-renewal",
            title: "Old draft",
            version: "1.0.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "passport-renewal",
            title: "Passport Renewal",
            version: "1.1.0",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      formId: "passport-renewal",
      version: "1.1.0",
      isPublished: true,
    });
  });

  it("keeps the draft when its version is newer than the published copy", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "passport-renewal",
            title: "Newer draft",
            version: "1.2.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "passport-renewal",
            title: "Passport Renewal",
            version: "1.1.0",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      formId: "passport-renewal",
      version: "1.2.0",
      isPublished: false,
    });
  });

  it("filters out tombstoned formIds (disabled list)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve([]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          { formId: "ghost", title: "Ghost", version: "1.0.0" },
          { formId: "alive", title: "Alive", version: "1.0.0" },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve(["ghost"]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result.map((f) => f.formId)).toEqual(["alive"]);
  });
});

describe("getRecipe (draft-vs-published precedence)", () => {
  const FORM_ID = "apply-for-conductor-licence";

  // A schema-valid published recipe; getRecipe parses the published copy before
  // returning it, so it must satisfy serviceContractRecipeSchema.
  function publishedRecipe(version: string) {
    return {
      formId: FORM_ID,
      title: "Apply for Conductor Licence",
      description: "Apply for a conductor licence",
      version,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
      steps: [],
    };
  }

  function draftRecipe(version: string) {
    return { ...publishedRecipe(version), title: "Conductor (draft)" };
  }

  it("returns the published copy when it is newer than the draft", async () => {
    apiGet.mockResolvedValue(draftRecipe("1.1.0"));
    getPublishedRecipeMock.mockResolvedValue(publishedRecipe("1.3.0"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.version).toBe("1.3.0");
    expect(result.title).toBe("Apply for Conductor Licence");
  });

  it("returns the draft when its version is greater than or equal to the published copy", async () => {
    apiGet.mockResolvedValue(draftRecipe("1.3.0"));
    getPublishedRecipeMock.mockResolvedValue(publishedRecipe("1.3.0"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.version).toBe("1.3.0");
    // Equal versions tie-break to the draft.
    expect(result.title).toBe("Conductor (draft)");
  });

  it("falls back to the draft when there is no published copy", async () => {
    apiGet.mockResolvedValue(draftRecipe("1.1.0"));
    getPublishedRecipeMock.mockRejectedValue(new Error("no published recipe"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.version).toBe("1.1.0");
    expect(result.title).toBe("Conductor (draft)");
  });

  it("returns the published copy when there is no draft (404)", async () => {
    apiGet.mockRejectedValue(new ApiError(404, "not found"));
    getPublishedRecipeMock.mockResolvedValue(publishedRecipe("1.3.0"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.version).toBe("1.3.0");
    expect(result.title).toBe("Apply for Conductor Licence");
  });
});
