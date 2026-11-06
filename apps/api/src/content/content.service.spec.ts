import { ServiceUnavailableException } from "@nestjs/common";
import { vi, type MockInstance } from "vitest";
import {
  ContentService,
  filterVisible,
  toServiceIndexEntry,
  visibilityForStatus,
} from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";
import { ServiceStatus } from "@/database/entities/service-status.entity";

/** A ConfigService stub; unset keys fall back to the caller's default. */
const configWith = (values: Record<string, string> = {}) =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as never;

const entries: ServiceIndexEntry[] = [
  { slug: "a", title: "A", visibility: "public" },
  { slug: "b", title: "B", visibility: "preview" },
  { slug: "c", title: "C", visibility: "draft" },
];

describe("filterVisible", () => {
  it("returns only public entries when includeNonPublic is false", () => {
    expect(filterVisible(entries, false)).toEqual([
      { slug: "a", title: "A", visibility: "public" },
    ]);
  });

  it("returns every entry when includeNonPublic is true", () => {
    expect(filterVisible(entries, true)).toEqual(entries);
  });
});

describe("visibilityForStatus", () => {
  it("maps enabled to public", () => {
    expect(visibilityForStatus(ServiceStatus.ENABLED)).toBe("public");
  });

  it("maps form_disabled to public (page stays listed; only the form is gated)", () => {
    expect(visibilityForStatus(ServiceStatus.FORM_DISABLED)).toBe("public");
  });

  it("maps disabled to preview", () => {
    expect(visibilityForStatus(ServiceStatus.DISABLED)).toBe("preview");
  });

  it("defaults a service with no row to preview (fail-closed)", () => {
    expect(visibilityForStatus(undefined)).toBe("preview");
  });
});

describe("ContentService.list", () => {
  it("derives visibility from the service_status DB, keyed by formId ?? slug", async () => {
    const statuses = [
      { slug: "form-x", status: ServiceStatus.DISABLED },
      { slug: "info-page", status: ServiceStatus.ENABLED },
    ];
    const serviceStatus = { list: vi.fn().mockResolvedValue(statuses) };
    const service = new ContentService(serviceStatus as never, configWith());

    vi.spyOn(service, "index").mockResolvedValue([
      // form-backed: keyed by its formId
      { slug: "money/x", title: "X", formId: "form-x", visibility: "public" },
      // info page: keyed by its slug
      { slug: "info-page", title: "Info", visibility: "draft" },
      // no row → fail-closed to preview
      { slug: "orphan", title: "Orphan", visibility: "public" },
    ]);

    const authed = await service.list(true);
    expect(authed).toEqual([
      { slug: "money/x", title: "X", formId: "form-x", visibility: "preview" },
      { slug: "info-page", title: "Info", visibility: "public" },
      { slug: "orphan", title: "Orphan", visibility: "preview" },
    ]);

    // Public request keeps only the DB-derived public entries.
    const publicOnly = await service.list(false);
    expect(publicOnly.map((e) => e.slug)).toEqual(["info-page"]);
  });

  it("runs over the real services index; no status rows fail closed to preview", async () => {
    const serviceStatus = { list: vi.fn().mockResolvedValue([]) };
    const service = new ContentService(serviceStatus as never, configWith());

    // No `index()` spy here, so the real static catalogue is used.
    const all = await service.list(true);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.visibility === "preview")).toBe(true);

    // Every service is preview, so the public request returns nothing.
    expect(await service.list(false)).toEqual([]);
  });
});

describe("ContentService.categoryForForm", () => {
  const service = new ContentService({ list: vi.fn() } as never, configWith());

  it("returns the category of the service that links the form", async () => {
    vi.spyOn(service, "index").mockResolvedValue([
      { slug: "info", title: "Info", category: "travel", visibility: "public" },
      {
        slug: "education/x",
        title: "X",
        category: "education",
        formId: "form-x",
        visibility: "public",
      },
    ]);
    expect(await service.categoryForForm("form-x")).toBe("education");
  });

  it("returns undefined when no service links the form", async () => {
    vi.spyOn(service, "index").mockResolvedValue([]);
    expect(await service.categoryForForm("unknown")).toBeUndefined();
  });
});

describe("toServiceIndexEntry", () => {
  const page = {
    url: "/money/calculate-severance-pay",
    slug: "calculate-severance-pay",
    title: "Calculate your severance pay",
    category: "money",
    form_id: null,
    visibility: "public" as const,
  };

  it("keeps the leaf for /category/leaf", () => {
    expect(toServiceIndexEntry(page)).toEqual({
      slug: "calculate-severance-pay",
      title: "Calculate your severance pay",
      category: "money",
      visibility: "public",
    });
  });

  it("uses the whole path for /category/sub/leaf", () => {
    expect(
      toServiceIndexEntry({
        ...page,
        url: "/youth-and-community/arts-culture/yar",
        slug: "yar",
        category: "youth-and-community",
      }).slug,
    ).toBe("youth-and-community/arts-culture/yar");
  });

  it("uses the whole path for /category/service/supporting", () => {
    expect(
      toServiceIndexEntry({
        ...page,
        url: "/money/calculate-your-pension/about-government-pensions",
        slug: "about-government-pensions",
      }).slug,
    ).toBe("money/calculate-your-pension/about-government-pensions");
  });

  it("keeps the leaf for /leaf and omits a null or absent category", () => {
    const root = {
      ...page,
      url: "/terms-conditions",
      slug: "terms-conditions",
    };
    expect(toServiceIndexEntry({ ...root, category: null })).toEqual({
      slug: "terms-conditions",
      title: "Calculate your severance pay",
      visibility: "public",
    });
    const { category: _omitted, ...noCategory } = root;
    expect(toServiceIndexEntry(noCategory)).not.toHaveProperty("category");
  });

  it("copies form_id as formId and passes visibility through", () => {
    expect(
      toServiceIndexEntry({
        ...page,
        form_id: "form-x",
        visibility: "preview",
      }),
    ).toMatchObject({ formId: "form-x", visibility: "preview" });
    expect(toServiceIndexEntry(page)).not.toHaveProperty("formId");
  });
});

describe("ContentService in api_v2 mode (API_V2_URL set)", () => {
  const catalog = {
    pages: [
      {
        url: "/youth-and-community/arts-culture/community-canvas",
        title: "Community Canvas",
        description: "ignored",
        slug: "community-canvas",
        category: "youth-and-community",
        subcategory: "arts-culture",
        form_id: "youth-opportunity-community-canvas",
        visibility: "preview",
      },
      {
        url: "/money/calculate-severance-pay",
        title: "Calculate your severance pay",
        slug: "calculate-severance-pay",
        category: "money",
        subcategory: null,
        form_id: null,
        visibility: "public",
      },
    ],
  };
  const sorted: ServiceIndexEntry[] = [
    {
      slug: "calculate-severance-pay",
      title: "Calculate your severance pay",
      category: "money",
      visibility: "public",
    },
    {
      slug: "youth-and-community/arts-culture/community-canvas",
      title: "Community Canvas",
      category: "youth-and-community",
      formId: "youth-opportunity-community-canvas",
      visibility: "preview",
    },
  ];
  const ok = () => new Response(JSON.stringify(catalog), { status: 200 });

  let fetchSpy: MockInstance<typeof fetch>;
  let serviceStatus: { list: ReturnType<typeof vi.fn> };
  const make = (token = "secret") =>
    new ContentService(
      serviceStatus as never,
      configWith({
        API_V2_URL: "https://api-v2.test//",
        RECIPE_PREVIEW_TOKEN: token,
      }),
    );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
    fetchSpy = vi.spyOn(globalThis, "fetch");
    serviceStatus = { list: vi.fn().mockResolvedValue([]) };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads /catalog with the preview token, maps and sorts by slug", async () => {
    fetchSpy.mockResolvedValue(ok());
    expect(await make().index()).toEqual(sorted);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api-v2.test/catalog");
    expect(init?.headers).toEqual({ "x-preview-token": "secret" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no preview header when the token is empty", async () => {
    fetchSpy.mockResolvedValue(ok());
    await make("").index();
    expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({});
  });

  it("serves index(), list(true) and list(false) from one fetch within 60s", async () => {
    fetchSpy.mockResolvedValue(ok());
    const service = make();
    expect(await service.index()).toEqual(sorted);
    expect(await service.list(true)).toEqual(sorted);
    expect(await service.list(false)).toEqual([sorted[0]]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(serviceStatus.list).not.toHaveBeenCalled();
  });

  it("never lists a preview entry publicly", async () => {
    fetchSpy.mockResolvedValue(ok());
    const publicList = await make().list(false);
    expect(publicList.some((e) => e.visibility !== "public")).toBe(false);
  });

  it("refetches after 60s", async () => {
    fetchSpy.mockImplementation(async () => ok());
    const service = make();
    await service.index();
    vi.advanceTimersByTime(59_000);
    await service.index();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    await service.index();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a rejected fetch", () => Promise.reject(new Error("down"))],
    ["a 500", async () => new Response("oops", { status: 500 })],
    [
      "a 401",
      async () =>
        new Response('{"error":"invalid_preview_token"}', { status: 401 }),
    ],
    ["a garbage body", async () => new Response('{"pages":[{}]}')],
  ])(
    "serves the last good copy on %s refresh and waits 60s to retry",
    async (_name, failure) => {
      const service = make();
      fetchSpy.mockResolvedValueOnce(ok());
      await service.index();

      vi.advanceTimersByTime(61_000);
      fetchSpy.mockImplementation(failure);
      expect(await service.index()).toEqual(sorted);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(59_000);
      expect(await service.index()).toEqual(sorted);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ["a rejected fetch", () => Promise.reject(new Error("down"))],
    [
      "a 401",
      async () =>
        new Response('{"error":"invalid_preview_token"}', { status: 401 }),
    ],
  ])(
    "throws ServiceUnavailableException on a cold %s, and retries next call",
    async (_name, failure) => {
      const service = make();
      fetchSpy.mockImplementationOnce(failure);
      await expect(service.list(false)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      fetchSpy.mockResolvedValueOnce(ok());
      expect(await service.index()).toEqual(sorted);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    },
  );
});
