import { vi } from "vitest";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("./api-client", () => ({ api: { put, get } }));

import { getServiceAudit, setServiceStatus } from "./service-status";

describe("setServiceStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the audit for the given slug (url-encoded)", async () => {
    get.mockResolvedValue([]);

    await getServiceAudit({ data: { slug: "a/b service" } } as never);

    expect(get).toHaveBeenCalledWith(
      "/service_status/audit?slug=a%2Fb%20service",
    );
  });
});
