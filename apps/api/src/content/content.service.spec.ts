import { vi } from "vitest";
import {
  ContentService,
  filterVisible,
  visibilityForStatus,
} from "./content.service";
import type { ServiceIndexEntry } from "./service-index.type";
import { ServiceStatus } from "@/database/entities/service-status.entity";

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
    const service = new ContentService(serviceStatus as never);

    vi.spyOn(service, "index").mockReturnValue([
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
    const service = new ContentService(serviceStatus as never);

    // No `index()` spy here, so the real static catalogue is used.
    const all = await service.list(true);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.visibility === "preview")).toBe(true);

    // Every service is preview, so the public request returns nothing.
    expect(await service.list(false)).toEqual([]);
  });
});
