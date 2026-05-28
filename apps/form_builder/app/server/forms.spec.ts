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

import { getSession } from "./session-cipher.server";
import { api } from "./api-client";
import { listForms } from "./forms";

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
