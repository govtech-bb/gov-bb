import { vi } from "vitest";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("./api-client", () => ({ api: { put, get } }));

import {
  getServiceAudit,
  listServices,
  mapServicesIndex,
  setServiceStatus,
} from "./service-status";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mapServicesIndex", () => {
  it("maps index entries to the reconciler's landing-service shape", () => {
    expect(
      mapServicesIndex([
        {
          slug: "family/get-x",
          title: "Get X",
          category: "family",
          formId: "get-x",
          visibility: "preview",
        },
        { slug: "info-only", title: "Info only" },
      ]),
    ).toEqual([
      {
        contentSlug: "family/get-x",
        title: "Get X",
        category: "family",
        formId: "get-x",
        contentVisibility: "preview",
      },
      { contentSlug: "info-only", title: "Info only" },
    ]);
  });
});

describe("listServices", () => {
  it("fetches /services, /form-definitions and /service_status, then reconciles", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/services")
        return Promise.resolve([
          {
            slug: "get-x",
            title: "Get X",
            formId: "get-x",
            visibility: "public",
          },
        ]);
      if (path === "/form-definitions")
        return Promise.resolve([{ formId: "get-x", title: "Get X form" }]);
      if (path === "/service_status")
        return Promise.resolve([{ slug: "get-x", status: "disabled" }]);
      return Promise.resolve([]);
    });

    const rows = await listServices();

    expect(get).toHaveBeenCalledWith("/services");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "get-x",
      hasForm: true,
      status: "disabled",
    });
  });

  it("degrades to forms + statuses when /services fails", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/services") return Promise.reject(new Error("boom"));
      if (path === "/form-definitions")
        return Promise.resolve([{ formId: "only-form", title: "Only form" }]);
      if (path === "/service_status") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const rows = await listServices();

    expect(rows).toEqual([
      expect.objectContaining({ slug: "only-form", hasForm: true }),
    ]);
  });
});

describe("setServiceStatus", () => {
  it("sends the session login as the audit author, not a client value", async () => {
    put.mockResolvedValue({ slug: "passport-renewal", status: "disabled" });

    const result = await setServiceStatus({
      data: { slug: "passport-renewal", status: "disabled" },
      context: { session: { login: "octocat", accessToken: "", expiresAt: 0 } },
    } as never);

    expect(put).toHaveBeenCalledWith("/service_status", {
      slug: "passport-renewal",
      status: "disabled",
      author: "octocat",
    });
    expect(result).toEqual({ slug: "passport-renewal", status: "disabled" });
  });
});

describe("getServiceAudit", () => {
  it("requests the audit for the given slug (url-encoded)", async () => {
    get.mockResolvedValue([]);

    await getServiceAudit({ data: { slug: "a/b service" } } as never);

    expect(get).toHaveBeenCalledWith(
      "/service_status/audit?slug=a%2Fb%20service",
    );
  });
});
