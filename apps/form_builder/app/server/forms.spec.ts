import type { Mock } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServiceRows } from "../components/services/service-model";
/**
 * @vitest-environment node
 */
import type { BuilderFormSummary } from "../types/index";

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
  getRecipeCommittedAt: vi.fn(),
  RecipeNotFoundError: class RecipeNotFoundError extends Error {},
  RECIPES_BASE: "apps/api/src/forms/form-definitions/recipes",
}));

import { getSession } from "./session-cipher.server";
import { api, ApiError } from "./api-client";
import {
  getPublishedRecipe,
  getRecipeCommittedAt,
  RecipeNotFoundError,
} from "./github-recipes";
import {
  listForms,
  getRecipe,
  rekeyRecipe,
  resolveCurrentRecipe,
  submitRecipe,
  updateRecipe,
} from "./forms";

const getPublishedRecipeMock = getPublishedRecipe as Mock;
const getRecipeCommittedAtMock = getRecipeCommittedAt as Mock;

const SESSION = {
  login: "alice",
  accessToken: "gho_test_token",
  expiresAt: Date.now() + 3600_000,
};

const apiGet = api.get as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BUILDER_API_URL", "https://builder-api.example.test");
  process.env.SESSION_SECRET = Buffer.alloc(32).toString("base64");
  (getSession as Mock).mockReturnValue(SESSION);
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    const drafts: BuilderFormSummary[] = [
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

  it("prefers the draft row, marking it isPublished from the index (#1196)", async () => {
    // #1196: the draft row is the current working copy, so it always wins the
    // merge; isPublished is OR'd in from the published index.
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "passport-renewal",
            title: "Working draft",
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
      title: "Working draft",
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

  it("carries visibility from the published index, including a non-public form with no DB draft (#1835)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve([]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "hidden",
            title: "Under Maintenance",
            version: "1.0.0",
            visibility: "maintenance",
          },
          {
            formId: "live",
            title: "Live",
            version: "1.0.0",
            visibility: "public",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();
    const byId = Object.fromEntries(result.map((f) => [f.formId, f]));

    // The whole point of #1835: a published non-public form with no DB draft
    // reaches the picker and carries its visibility for the badge.
    expect(byId["hidden"].visibility).toBe("maintenance");
    expect(byId["live"].visibility).toBe("public");
  });

  it("carries the published visibility even when a draft row wins the merge (#1835)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "hidden",
            title: "Hidden (newer draft)",
            version: "1.1.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          {
            formId: "hidden",
            title: "Hidden",
            version: "1.0.0",
            visibility: "preview",
          },
        ]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();
    expect(result[0].visibility).toBe("preview");
  });

  it("leaves visibility undefined for a draft-only form absent from the published index (#1835)", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms")
        return Promise.resolve([
          {
            id: "uuid-1",
            formId: "draft-only",
            title: "Draft Only",
            version: "1.0.0",
            isPublished: false,
          },
        ]);
      if (path === "/builder/forms/published") return Promise.resolve([]);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();
    expect(result[0].visibility).toBeUndefined();
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

  it("keeps a disabled draft-only formId, marking it isDisabled (not an orphan override)", async () => {
    const drafts: BuilderFormSummary[] = [
      {
        id: "uuid-1",
        formId: "draft-only-disabled",
        title: "Draft Only Disabled",
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
        return Promise.resolve(["draft-only-disabled"]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result.map((f) => f.formId).sort()).toEqual([
      "alive",
      "draft-only-disabled",
    ]);
    const kept = result.find((f) => f.formId === "draft-only-disabled");
    // It still has a draft row, so it can be opened/edited — not an orphan.
    expect(kept).toMatchObject({
      formId: "draft-only-disabled",
      isDisabled: true,
      isOrphanOverride: false,
      isPublished: false,
    });
  });

  it("seeds an orphan-override row for a disabled formId with no draft and no published entry", async () => {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve([]);
      if (path === "/builder/forms/published")
        return Promise.resolve([
          { formId: "alive", title: "Alive", version: "1.0.0" },
        ]);
      if (path === "/builder/forms/disabled")
        return Promise.resolve(["lost-form"]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await listForms();

    expect(result.map((f) => f.formId).sort()).toEqual(["alive", "lost-form"]);
    const orphan = result.find((f) => f.formId === "lost-form");
    // No recipe to name it, so the title falls back to the bare formId.
    expect(orphan).toMatchObject({
      formId: "lost-form",
      title: "lost-form",
      isDisabled: true,
      isOrphanOverride: true,
      isPublished: false,
      // #2411: a synthetic override row is seeded after `draftIds` is built,
      // so it must not claim a working copy — there is no row to delete.
      hasDraftRow: false,
    });
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
      // #2411: the row is real, so the flag is true even though the picker
      // suppresses the action here — Enable wins a disabled row.
      hasDraftRow: true,
    });
  });

  it("leaves isDisabled falsy on entries not in the disabled list", async () => {
    const drafts: BuilderFormSummary[] = [
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

  // The #2489 re-sync runs after precedence is decided; answer "not stale" so
  // these tests stay about precedence and hydration.
  beforeEach(() => {
    (api.post as Mock).mockResolvedValue({ resynced: false });
  });

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

  it("returns the draft when present, ignoring the published copy (#1196)", async () => {
    // #1196: the DB scratch draft is the working copy — it always wins when
    // present; the published flat file is only the fallback (no version compare).
    apiGet.mockResolvedValue(draftRecipe("1.1.0"));
    getPublishedRecipeMock.mockResolvedValue(publishedRecipe("1.3.0"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

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

  it("hydrates meta from the published recipe when the draft row has none (#1682)", async () => {
    // The #1517 flagged forms had meta.visibility written straight into the
    // published flat files (#1676), bypassing the builder save flow — so their
    // DB scratch rows carry no meta. Backfill it from the published copy so the
    // builder's visibility control reflects the live launch gate, not "public".
    apiGet.mockResolvedValue(draftRecipe("1.1.0")); // no meta
    getPublishedRecipeMock.mockResolvedValue({
      ...publishedRecipe("1.3.0"),
      meta: { visibility: "preview" },
    });

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    // The draft still wins for content; only the absent meta is hydrated.
    expect(result.title).toBe("Conductor (draft)");
    expect(result.meta).toEqual({ visibility: "preview" });
  });

  it("keeps the draft's own meta over the published copy (in-progress edit wins)", async () => {
    // A post-#1682 draft that set visibility in the builder is the working copy
    // (#1196) — hydration must only fill an absent meta, never overwrite one.
    apiGet.mockResolvedValue({
      ...draftRecipe("1.1.0"),
      meta: { visibility: "public" },
    });
    getPublishedRecipeMock.mockResolvedValue({
      ...publishedRecipe("1.3.0"),
      meta: { visibility: "preview" },
    });

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.meta).toEqual({ visibility: "public" });
  });

  it("leaves meta absent when neither the draft nor the published recipe has it", async () => {
    apiGet.mockResolvedValue(draftRecipe("1.1.0")); // no meta
    getPublishedRecipeMock.mockResolvedValue(publishedRecipe("1.3.0")); // no meta

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.meta).toBeUndefined();
  });

  it("leaves meta absent when the draft has none and there is no published recipe", async () => {
    // A never-deployed draft has no flat file: the hydration fetch fails and is
    // swallowed, leaving meta absent (getRecipeVisibility treats that as public).
    apiGet.mockResolvedValue(draftRecipe("1.1.0")); // no meta
    getPublishedRecipeMock.mockRejectedValue(new Error("no published recipe"));

    const result = await getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);

    expect(result.meta).toBeUndefined();
    expect(result.title).toBe("Conductor (draft)");
  });
});

// #2489: a draft row that predates the committed recipe (a hand-fix merged
// while the row sat idle) is replaced by the committed recipe on open, so a
// later Deploy republishes the fix instead of reverting it. Staleness is
// decided by the API from the row's own updated_at (forms.resync.db.spec.ts
// covers the SQL); this spec covers what getRecipe does around that call.
// #2878: "committed at" is the recipe's own `updatedAt`; the git committer
// date is read only for a committed copy whose stamp is absent.
describe("getRecipe — re-syncs a stale draft row from the committed recipe (#2489)", () => {
  const FORM_ID = "apply-for-conductor-licence";
  const COMMITTED_AT = "2026-09-15T10:00:00Z";
  const apiPost = api.post as Mock;
  // meta on both copies keeps the #1682 hydration fetch out of the way.
  const published = {
    formId: FORM_ID,
    title: "Apply for Conductor Licence",
    description: "Apply for a conductor licence",
    version: "1.3.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    steps: [],
    meta: { visibility: "public" },
  };
  const draft = { ...published, title: "Conductor (draft)", version: "1.1.0" };

  function call() {
    return getRecipe({
      data: { formId: FORM_ID },
      context: { session: SESSION },
    } as never);
  }

  it("replaces the draft with the committed recipe when the API confirms the row predates its updatedAt", async () => {
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: true });

    const result = await call();

    expect(result.title).toBe("Apply for Conductor Licence");
    // #2878: the committed recipe's own stamp decides; git is not consulted.
    expect(getRecipeCommittedAtMock).not.toHaveBeenCalled();
    expect(apiPost).toHaveBeenCalledWith(`/builder/forms/${FORM_ID}/resync`, {
      recipe: expect.objectContaining({ title: "Apply for Conductor Licence" }),
      committedAt: published.updatedAt,
    });
  });

  it("normalises a committed updatedAt with an offset to the UTC instant the API accepts (#2878)", async () => {
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue({
      ...published,
      updatedAt: "2026-09-15T10:00:00+04:00",
    });
    apiPost.mockResolvedValue({ resynced: true });

    await call();

    expect(apiPost).toHaveBeenCalledWith(
      `/builder/forms/${FORM_ID}/resync`,
      expect.objectContaining({ committedAt: "2026-09-15T06:00:00.000Z" }),
    );
  });

  it("falls back to the git committer date when the committed recipe carries no updatedAt (#2878)", async () => {
    const { updatedAt: _stamp, ...unstamped } = published;
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(unstamped);
    getRecipeCommittedAtMock.mockResolvedValue(COMMITTED_AT);
    apiPost.mockResolvedValue({ resynced: true });

    const result = await call();

    expect(result.title).toBe("Apply for Conductor Licence");
    expect(getRecipeCommittedAtMock).toHaveBeenCalledWith(
      SESSION.accessToken,
      FORM_ID,
    );
    expect(apiPost).toHaveBeenCalledWith(
      `/builder/forms/${FORM_ID}/resync`,
      expect.objectContaining({ committedAt: COMMITTED_AT }),
    );
  });

  it("keeps the draft when the committed recipe has no updatedAt and no commit touches it", async () => {
    const { updatedAt: _stamp, ...unstamped } = published;
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(unstamped);
    getRecipeCommittedAtMock.mockResolvedValue(null);

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("keeps the draft, with no git fallback, when the committed updatedAt is not a datetime", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue({
      ...published,
      updatedAt: "last Tuesday",
    });

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(getRecipeCommittedAtMock).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps the draft when the API reports it was saved after the committed stamp (or is a pre-#2489 row)", async () => {
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: false });

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
  });

  it("leaves a draft with no committed copy alone, quietly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockRejectedValue(
      new RecipeNotFoundError("Recipe not found"),
    );

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(getRecipeCommittedAtMock).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps the draft and still opens the form when GitHub cannot be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockRejectedValue(new Error("GitHub 503"));

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(apiPost).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("re-sync skipped"),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("keeps the draft when the git fallback read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { updatedAt: _stamp, ...unstamped } = published;
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(unstamped);
    getRecipeCommittedAtMock.mockRejectedValue(new Error("GitHub 503"));

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(apiPost).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeps the draft and still opens the form when the API re-sync call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockRejectedValue(new ApiError(500, "db down"));

    const result = await call();

    expect(result.title).toBe("Conductor (draft)");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reads the committed recipe once when the metaless row already hydrated it (#2900)", async () => {
    // A legacy row with no `meta` fetches the committed recipe to hydrate it
    // (#1682); the re-sync must reuse that copy, not read the same file again.
    const { meta: _meta, ...metalessDraft } = draft;
    apiGet.mockResolvedValue(metalessDraft);
    getRecipeCommittedAtMock.mockResolvedValue(COMMITTED_AT);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: true });

    const result = await call();

    expect(result.title).toBe("Apply for Conductor Licence");
    expect(result.meta).toEqual({ visibility: "public" });
    expect(getPublishedRecipeMock).toHaveBeenCalledTimes(1);
  });

  it("reads the committed recipe once for a row that needed no hydration (#2900)", async () => {
    apiGet.mockResolvedValue(draft);
    getRecipeCommittedAtMock.mockResolvedValue(COMMITTED_AT);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: true });

    await call();

    expect(getPublishedRecipeMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-sync the published fallback — with no draft row there is nothing stale", async () => {
    apiGet.mockRejectedValue(new ApiError(404, "not found"));
    getPublishedRecipeMock.mockResolvedValue(published);

    const result = await call();

    expect(result.title).toBe("Apply for Conductor Licence");
    expect(getRecipeCommittedAtMock).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});

// #2897: the services workspace's first adoption reads the form through this
// same resolver, so the recipe it stores is the one getRecipe would show —
// including the #2489 re-sync of a stale draft row — rather than the raw row.
describe("resolveCurrentRecipe — shared by getRecipe and services adoption (#2897)", () => {
  const FORM_ID = "apply-for-conductor-licence";
  const apiPost = api.post as Mock;
  const published = {
    formId: FORM_ID,
    title: "Apply for Conductor Licence",
    description: "Apply for a conductor licence",
    version: "1.3.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    steps: [],
    meta: { visibility: "public" },
  };
  const draft = { ...published, title: "Conductor (draft)", version: "1.1.0" };

  it("replaces a stale draft row with the committed recipe, as getRecipe does", async () => {
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: true });

    const result = await resolveCurrentRecipe(FORM_ID, SESSION.accessToken);

    expect(result?.title).toBe("Apply for Conductor Licence");
    expect(apiPost).toHaveBeenCalledWith(
      `/builder/forms/${FORM_ID}/resync`,
      expect.objectContaining({ committedAt: published.updatedAt }),
    );
  });

  it("keeps a draft row the API says was saved after the committed stamp", async () => {
    apiGet.mockResolvedValue(draft);
    getPublishedRecipeMock.mockResolvedValue(published);
    apiPost.mockResolvedValue({ resynced: false });

    const result = await resolveCurrentRecipe(FORM_ID, SESSION.accessToken);

    expect(result?.title).toBe("Conductor (draft)");
  });

  it("returns null when neither a draft row nor a committed copy exists", async () => {
    apiGet.mockRejectedValue(new ApiError(404, "not found"));
    getPublishedRecipeMock.mockRejectedValue(new Error("no published recipe"));

    await expect(
      resolveCurrentRecipe(FORM_ID, SESSION.accessToken),
    ).resolves.toBeNull();
  });
});

describe("listForms — hasDraftRow (#2411)", () => {
  function stub(drafts: unknown[], published: unknown[]) {
    apiGet.mockImplementation((path: string) => {
      if (path === "/builder/forms") return Promise.resolve(drafts);
      if (path === "/builder/forms/published")
        return Promise.resolve(published);
      if (path === "/builder/forms/disabled") return Promise.resolve([]);
      throw new Error(`unexpected path: ${path}`);
    });
  }

  it("flags a published form that a scratch row is shadowing", async () => {
    stub(
      [
        {
          id: "uuid-1",
          formId: "passport-renewal",
          title: "Passport Renewal (working copy)",
          version: "1.1.0",
          isPublished: false,
        },
      ],
      [
        {
          formId: "passport-renewal",
          title: "Passport Renewal",
          version: "1.0.0",
        },
      ],
    );

    const [form] = await listForms();

    // Both true at once is the whole point: the row wins the merge, and
    // isPublished is OR'd back on. Without hasDraftRow the picker cannot tell
    // this apart from a published form with no working copy.
    expect(form).toMatchObject({
      formId: "passport-renewal",
      isPublished: true,
      hasDraftRow: true,
    });
  });

  it("does not flag a published form with no scratch row", async () => {
    stub(
      [],
      [
        {
          formId: "drivers-licence",
          title: "Drivers Licence",
          version: "1.0.0",
        },
      ],
    );

    const [form] = await listForms();

    expect(form).toMatchObject({
      formId: "drivers-licence",
      isPublished: true,
      hasDraftRow: false,
    });
  });

  it("flags a draft-only form", async () => {
    stub(
      [
        {
          id: "uuid-2",
          formId: "new-thing",
          title: "New Thing",
          version: "0.1.0",
          isPublished: false,
        },
      ],
      [],
    );

    const [form] = await listForms();

    expect(form).toMatchObject({ formId: "new-thing", hasDraftRow: true });
  });
});

it("connects local service pages to canonical recipes and opens them only in unconfigured development", async () => {
  const root = await mkdtemp(join(tmpdir(), "service-forms-"));
  const recipes = join(root, "apps/api/src/forms/form-definitions/recipes");
  const recipe = {
    formId: "get-birth-certificate",
    title: "Get a birth certificate",
    version: "1.0.0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [],
    meta: { visibility: "preview" },
  };
  const cwd = vi
    .spyOn(process, "cwd")
    .mockReturnValue(join(root, "apps/form_builder"));
  try {
    vi.stubEnv("DEV", true);
    vi.stubEnv("BUILDER_API_URL", "");
    apiGet.mockRejectedValue(new Error("BUILDER_API_URL is not set"));
    await mkdir(join(recipes, recipe.formId), { recursive: true });
    await writeFile(
      join(recipes, `${recipe.formId}.json`),
      JSON.stringify(recipe),
    );
    await writeFile(
      join(recipes, recipe.formId, "0.1.0.json"),
      JSON.stringify({ ...recipe, version: "0.1.0" }),
    );
    await writeFile(join(recipes, "README.md"), "Canonical recipes");

    const forms = await listForms();
    expect(forms).toEqual([
      expect.objectContaining({
        formId: recipe.formId,
        title: recipe.title,
        version: "1.0.0",
        isPublished: true,
      }),
    ]);
    // #2875: no API here, so no status — the recipe's `meta.visibility` is
    // never read as one (the builder renders this as "Status unavailable").
    expect(forms[0]).not.toHaveProperty("visibility");
    const pages = ["index", "start", "help"].map((name) => ({
      path: `apps/landing/src/content/${recipe.formId}/${name}.md`,
      title: recipe.title,
      formId: name === "help" ? "" : recipe.formId,
      category: "family-birth-relationships",
      visibility: "public",
      hasFormButton: name === "start",
    }));
    expect(buildServiceRows(forms, pages)).toEqual([
      expect.objectContaining({
        form: forms[0],
        hasForm: true,
        pages: expect.arrayContaining(pages),
      }),
    ]);
    expect(
      await getRecipe({
        data: { formId: recipe.formId },
        context: { session: SESSION },
      } as never),
    ).toEqual(recipe);
    await expect(
      getRecipe({
        data: { formId: "../outside" },
        context: { session: SESSION },
      } as never),
    ).rejects.toThrow();
    expect(apiGet).not.toHaveBeenCalled();
    expect(getPublishedRecipeMock).not.toHaveBeenCalled();

    vi.stubEnv("BUILDER_API_URL", "http://127.0.0.1:3003");
    apiGet.mockRejectedValue(new TypeError("fetch failed"));
    expect(await listForms()).toEqual(forms);
    expect(
      await getRecipe({
        data: { formId: recipe.formId },
        context: { session: SESSION },
      } as never),
    ).toEqual(recipe);

    apiGet.mockRejectedValue(new ApiError(401, "Not authorised"));
    await expect(listForms()).rejects.toThrow("Not authorised");
    await expect(
      getRecipe({
        data: { formId: recipe.formId },
        context: { session: SESSION },
      } as never),
    ).rejects.toThrow("Not authorised");
    vi.stubEnv("BUILDER_API_URL", "https://builder-api.example.test");
    apiGet.mockRejectedValue(new TypeError("fetch failed"));
    await expect(listForms()).rejects.toThrow("fetch failed");
    await expect(
      getRecipe({
        data: { formId: recipe.formId },
        context: { session: SESSION },
      } as never),
    ).rejects.toThrow("fetch failed");

    vi.stubEnv("BUILDER_API_URL", "");
    apiGet.mockRejectedValue(new Error("BUILDER_API_URL is not set"));
    vi.stubEnv("DEV", false);
    await expect(listForms()).rejects.toThrow("BUILDER_API_URL is not set");
    await expect(
      getRecipe({
        data: { formId: recipe.formId },
        context: { session: SESSION },
      } as never),
    ).rejects.toThrow("BUILDER_API_URL is not set");
  } finally {
    cwd.mockRestore();
    await rm(root, { recursive: true, force: true });
  }
});
