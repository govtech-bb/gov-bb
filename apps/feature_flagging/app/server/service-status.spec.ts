import { vi } from "vitest";

const { put, get } = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("./api-client", () => ({ api: { put, get } }));

const { sendSlackNotification } = vi.hoisted(() => ({
  sendSlackNotification: vi.fn(),
}));
vi.mock("./slack-notif", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./slack-notif")>()),
  sendSlackNotification,
}));

const flags = vi.hoisted(() => ({ pagesInEditor: false }));
vi.mock("../lib/service-url", () => ({
  get pagesInEditor() {
    return flags.pagesInEditor;
  },
}));

import {
  getServiceAudit,
  listServices,
  mapServicesIndex,
  setServiceStatus,
} from "./service-status";

beforeEach(() => {
  vi.clearAllMocks();
  flags.pagesInEditor = false;
});

const CTX = {
  context: {
    session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
  },
} as never;

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

    const rows = await listServices(CTX);

    expect(get).toHaveBeenCalledWith("/services", "gh_tok");
    expect(get).toHaveBeenCalledWith("/form-definitions", "gh_tok");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "get-x",
      hasForm: true,
      status: "disabled",
    });
  });

  it("lists a non-public form with no landing page and no status row (#2902)", async () => {
    // The API returns non-public forms only to the forwarded token, so a
    // brand-new builder form reaches the catalogue and can be switched on.
    get.mockImplementation((path: string, token?: string) => {
      if (path === "/form-definitions" && token === "gh_tok")
        return Promise.resolve([
          { formId: "new-draft-form", title: "New draft form" },
        ]);
      return Promise.resolve([]);
    });

    const rows = await listServices(CTX);

    expect(rows).toEqual([
      expect.objectContaining({
        slug: "new-draft-form",
        hasForm: true,
        status: "disabled",
      }),
    ]);
  });

  it("degrades to forms + statuses when /services fails", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/services") return Promise.reject(new Error("boom"));
      if (path === "/form-definitions")
        return Promise.resolve([{ formId: "only-form", title: "Only form" }]);
      if (path === "/service_status") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const rows = await listServices(CTX);

    expect(rows).toEqual([
      expect.objectContaining({ slug: "only-form", hasForm: true }),
    ]);
  });
});

describe("setServiceStatus", () => {
  it("forwards the GitHub token and sends neither author, title nor url in the body", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    const result = await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(put).toHaveBeenCalledWith(
      "/service_status",
      { slug: "passport-renewal", status: "disabled" },
      "gh_tok",
    );
    expect(result).toEqual({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });
  });

  it("notifies Slack with a linked title and the audit author on a change", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"<https://forms.example.gov.bb/forms/passport-renewal|Renew a passport>" has been changed from `enabled` to `disabled` by `audit-author`',
    );
  });

  it("keeps the title plain when the service has no public URL", async () => {
    put.mockResolvedValue({
      slug: "orphan-service",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "orphan-service",
        status: "disabled",
        title: "orphan-service",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"orphan-service" has been changed from `enabled` to `disabled` by `audit-author`',
    );
  });

  it("escapes mrkdwn control characters in the title", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Passports & visas <fast-track>",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"<https://forms.example.gov.bb/forms/passport-renewal|Passports &amp; visas &lt;fast-track&gt;>" has been changed from `enabled` to `disabled` by `audit-author`',
    );
  });

  it("does not link a url containing mrkdwn control characters", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/x|evil>injection",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"Renew a passport" has been changed from `enabled` to `disabled` by `audit-author`',
    );
  });

  it("does not link a non-http(s) url", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "javascript:alert(1)",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"Renew a passport" has been changed from `enabled` to `disabled` by `audit-author`',
    );
  });

  it("notifies with 'unset' as the origin on a service's first-ever status set", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: null,
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"<https://forms.example.gov.bb/forms/passport-renewal|Renew a passport>" has been changed from `unset` to `disabled` by `audit-author`',
    );
  });

  it("falls back to the session login when the API response has no author", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "enabled",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).toHaveBeenCalledWith(
      '"<https://forms.example.gov.bb/forms/passport-renewal|Renew a passport>" has been changed from `enabled` to `disabled` by `octocat`',
    );
  });

  it("does not notify Slack on an idempotent no-op (previousStatus === status)", async () => {
    put.mockResolvedValue({
      slug: "passport-renewal",
      status: "disabled",
      previousStatus: "disabled",
      author: "audit-author",
    });

    await setServiceStatus({
      data: {
        slug: "passport-renewal",
        status: "disabled",
        title: "Renew a passport",
        url: "https://forms.example.gov.bb/forms/passport-renewal",
      },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(sendSlackNotification).not.toHaveBeenCalled();
  });

  it("writes without a catalogue lookup before cutover", async () => {
    put.mockResolvedValue({
      slug: "info-only",
      status: "enabled",
      previousStatus: "enabled",
    });

    await setServiceStatus({
      data: { slug: "info-only", status: "enabled", title: "Info only" },
      ...(CTX as object),
    } as never);

    expect(get).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith(
      "/service_status",
      { slug: "info-only", status: "enabled" },
      "gh_tok",
    );
  });
});

describe("setServiceStatus after cutover (pagesInEditor)", () => {
  const REFUSAL =
    "This service has no form, so its status can't be changed here. Change its page in the content editor.";

  beforeEach(() => {
    flags.pagesInEditor = true;
    get.mockImplementation((path: string) => {
      if (path === "/services")
        return Promise.resolve([
          { slug: "info-only", title: "Info only" },
          { slug: "family/get-x", title: "Get X", formId: "get-x" },
        ]);
      if (path === "/form-definitions")
        return Promise.resolve([
          { formId: "get-x", title: "Get X form" },
          { formId: "form-only", title: "Form only" },
        ]);
      if (path === "/service_status")
        return Promise.resolve([{ slug: "stray", status: "enabled" }]);
      return Promise.resolve([]);
    });
    put.mockImplementation((_path: string, body: { slug: string }) =>
      Promise.resolve({
        slug: body.slug,
        status: "enabled",
        previousStatus: "enabled",
      }),
    );
  });

  const set = (slug: string) =>
    setServiceStatus({
      data: { slug, status: "enabled", title: slug },
      ...(CTX as object),
    } as never);

  it.each([
    ["a content-only page", "info-only"],
    ["an orphan status row", "stray"],
    ["a slug in no list", "nowhere"],
  ])("refuses %s", async (_label, slug) => {
    await expect(set(slug)).rejects.toThrow(REFUSAL);
    expect(put).not.toHaveBeenCalled();
    expect(sendSlackNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["a form with a page", "get-x"],
    ["a form with no page", "form-only"],
  ])("writes %s, reading the catalogue with the token", async (_l, slug) => {
    await set(slug);

    expect(get).toHaveBeenCalledWith("/form-definitions", "gh_tok");
    expect(put).toHaveBeenCalledWith(
      "/service_status",
      { slug, status: "enabled" },
      "gh_tok",
    );
  });

  it("fails closed when /form-definitions fails", async () => {
    get.mockImplementation((path: string) =>
      path === "/form-definitions"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve([]),
    );

    await expect(set("get-x")).rejects.toThrow("boom");
    expect(put).not.toHaveBeenCalled();
  });
});

describe("getServiceAudit", () => {
  it("requests the audit for the given slug (url-encoded) with the token", async () => {
    get.mockResolvedValue([]);

    await getServiceAudit({
      data: { slug: "a/b service" },
      context: {
        session: { login: "octocat", accessToken: "gh_tok", expiresAt: 0 },
      },
    } as never);

    expect(get).toHaveBeenCalledWith(
      "/service_status/audit?slug=a%2Fb%20service",
      "gh_tok",
    );
  });
});
