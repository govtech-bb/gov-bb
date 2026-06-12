import type { Mock } from "vitest";
/**
 * @vitest-environment node
 */
import type { FormDefinitionSummary } from "../types/index";

// Mock the auth surface before importing the SUT — the requireSession
// middleware reads SESSION_SECRET + a session cookie and would otherwise
// throw under jsdom-free jest. Matches the pattern in publish.spec.ts.
vi.mock("./session-cipher.server", () => ({
  getSession: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ cookie: "fb_session=opaque" }),
}));
vi.mock("./api-client", () => {
  const ApiError = class extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  };
  return {
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
    ApiError,
  };
});

// getRecipe resolves the published copy through getPublishedRecipe; mock it so
// the precedence tests don't hit GitHub.
vi.mock("./github-recipes", () => ({
  getPublishedRecipe: vi.fn(),
}));

import { getSession } from "./session-cipher.server";
import { api, ApiError } from "./api-client";
import { getPublishedRecipe } from "./github-recipes";
import {
  listForms,
  getRecipe,
  rekeyRecipe,
  submitRecipe,
  updateRecipe,
} from "./forms";

const getPublishedRecipeMock = getPublishedRecipe as Mock;

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

const apiGet = api.get as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  (getSession as Mock).mockReturnValue(SESSION);
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

  it("keeps the draft's version/title when newer, but stays isPublished from the index", async () => {
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
    // The draft wins the merge for the displayed version/title, but the formId
    // is in the published index so isPublished stays true.
    expect(result[0]).toMatchObject({
      formId: "passport-renewal",
      version: "1.2.0",
      isPublished: true,
    });
  });

  it("exposes publishedVersion (the index version) distinctly from the merged version", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "with-draft",
            title: "Newer draft",
            version: "1.2.0",
            isPublished: false,
          },
          {
            id: "uuid-2",
            formId: "draft-only",
            title: "Draft only",
            version: "1.0.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          { formId: "with-draft", title: "With Draft", version: "1.1.0" },
          {
            formId: "published-only",
            title: "Published Only",
            version: "2.0.0",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();
    const byId = Object.fromEntries(result.map((f) => [f.formId, f]));

    // A higher draft over a published copy: merged version is the draft's, but
    // publishedVersion is the (lower) version that's actually in the index.
    expect(byId["with-draft"]).toMatchObject({
      version: "1.2.0",
      publishedVersion: "1.1.0",
    });
    // A published-only form: publishedVersion equals the version.
    expect(byId["published-only"]).toMatchObject({
      version: "2.0.0",
      publishedVersion: "2.0.0",
    });
    // A draft-only form is not in the index, so it has no publishedVersion.
    expect(byId["draft-only"].publishedVersion).toBeUndefined();
  });

  it("keeps a disabled published form, marking it isDisabled: true", async () => {
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

    expect(result.map((f) => f.formId).sort()).toEqual(["alive", "ghost"]);
    const ghost = result.find((f) => f.formId === "ghost");
    expect(ghost).toMatchObject({ formId: "ghost", isDisabled: true });
  });

  it("drops a disabled non-published (draft-only) formId", async () => {
    const drafts: FormDefinitionSummary[] = [
      {
        id: "uuid-1",
        formId: "orphan-draft",
        title: "Orphan Draft",
        version: "1.0.0",
        isPublished: false,
      },
    ];
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve(drafts);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          { formId: "alive", title: "Alive", version: "1.0.0" },
        ]);
      if (path === "/builder/forms/disabled")
        return Promise.resolve(["orphan-draft"]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result.map((f) => f.formId)).toEqual(["alive"]);
  });

  it("keeps isPublished: true for a published formId with a newer draft", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "passport-renewal",
            title: "Newer draft",
            version: "2.0.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "passport-renewal",
            title: "Passport Renewal",
            version: "1.0.0",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(1);
    // Draft wins the merge for title/version, but membership in the published
    // index drives isPublished.
    expect(result[0]).toMatchObject({
      formId: "passport-renewal",
      version: "2.0.0",
      isPublished: true,
    });
  });

  it("keeps a disabled published formId with a newer draft, marking it isDisabled: true", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "passport-renewal",
            title: "Newer draft",
            version: "2.0.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "passport-renewal",
            title: "Passport Renewal",
            version: "1.0.0",
          },
        ]);
      if (path === "/builder/forms/disabled")
        return Promise.resolve(["passport-renewal"]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      formId: "passport-renewal",
      version: "2.0.0",
      isPublished: true,
      isDisabled: true,
    });
  });

  it("leaves isDisabled falsy on entries not in the disabled list", async () => {
    const drafts: FormDefinitionSummary[] = [
      {
        id: "uuid-1",
        formId: "passport-renewal",
        title: "Passport Renewal (draft)",
        version: "1.1.0",
        isPublished: false,
      },
    ];
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve(drafts);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "drivers-licence",
            title: "Drivers Licence",
            version: "1.0.0",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result).toHaveLength(2);
    for (const f of result) expect(f.isDisabled).toBeFalsy();
  });
});

describe("rekeyRecipe", () => {
  it("posts the recipe to the old form's rekey endpoint", async () => {
    const apiPost = api.post as Mock;
    apiPost.mockResolvedValue(undefined);
    const recipe = { formId: "birth-registration", version: "1.0.0" };

    await rekeyRecipe({
      data: { oldFormId: "birth-reg-old", recipe },
      context: { session: SESSION },
    } as never);

    expect(apiPost).toHaveBeenCalledWith("/builder/forms/birth-reg-old/rekey", {
      recipe,
      userLogin: "alice",
    });
  });

  it("URL-encodes the old form ID in the endpoint path", async () => {
    const apiPost = api.post as Mock;
    apiPost.mockResolvedValue(undefined);

    await rekeyRecipe({
      data: {
        oldFormId: "weird id/with slash",
        recipe: { formId: "clean-id", version: "1.0.0" },
      },
      context: { session: SESSION },
    } as never);

    expect(apiPost.mock.calls[0][0] as string).toBe(
      "/builder/forms/weird%20id%2Fwith%20slash/rekey",
    );
  });
});

describe("submitRecipe — userLogin threading (#874)", () => {
  it("stamps the session login onto the save so the read-only-lock gate passes", async () => {
    const apiPost = api.post as Mock;
    apiPost.mockResolvedValue(undefined);
    const recipe = { formId: "marriage-license", version: "1.0.0" };

    await submitRecipe({
      data: { recipe, isNew: true },
      context: { session: SESSION },
    } as never);

    expect(apiPost).toHaveBeenCalledWith("/builder/forms", {
      recipe,
      isNew: true,
      userLogin: "alice",
    });
  });
});

describe("updateRecipe — userLogin threading (#874)", () => {
  it("stamps the session login onto the PUT save", async () => {
    const apiPut = api.put as Mock;
    apiPut.mockResolvedValue(undefined);
    const recipe = { formId: "marriage-license", version: "1.0.0" };

    await updateRecipe({
      data: { formId: "marriage-license", recipe },
      context: { session: SESSION },
    } as never);

    expect(apiPut).toHaveBeenCalledWith("/builder/forms/marriage-license", {
      recipe,
      userLogin: "alice",
    });
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
