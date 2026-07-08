import { describe, expect, it } from "vitest";
import { ServiceStatus } from "../src/entities";
import {
  buildServiceStatusSeed,
  type SeedContentEntry,
  type SeedFormVisibility,
} from "./build-service-status-seed";

// Helper: run the builder and return a slug→status lookup for terse assertions.
function statusBySlug(
  content: SeedContentEntry[],
  forms: Record<string, SeedFormVisibility>,
): Record<string, ServiceStatus> {
  const { rows } = buildServiceStatusSeed(content, forms);
  return Object.fromEntries(rows.map((r) => [r.slug, r.status]));
}

describe("buildServiceStatusSeed — derivation matrix", () => {
  it("public page + public form → enabled (keyed by form_id)", () => {
    const { rows } = buildServiceStatusSeed(
      [
        {
          slug: "births/register",
          formId: "register-a-birth",
          visibility: "public",
        },
      ],
      { "register-a-birth": "public" },
    );
    expect(rows).toEqual([
      { slug: "register-a-birth", status: ServiceStatus.ENABLED },
    ]);
  });

  it("public page + preview/draft/maintenance form → form_disabled", () => {
    const map = statusBySlug(
      [
        { slug: "a", formId: "form-a", visibility: "public" },
        { slug: "b", formId: "form-b", visibility: "public" },
        { slug: "c", formId: "form-c", visibility: "public" },
      ],
      { "form-a": "preview", "form-b": "draft", "form-c": "maintenance" },
    );
    expect(map["form-a"]).toBe(ServiceStatus.FORM_DISABLED);
    expect(map["form-b"]).toBe(ServiceStatus.FORM_DISABLED);
    expect(map["form-c"]).toBe(ServiceStatus.FORM_DISABLED);
  });

  it("public page + form_id matching no recipe → form_disabled + warning", () => {
    const { rows, warnings } = buildServiceStatusSeed(
      [{ slug: "svc", formId: "ghost-form", visibility: "public" }],
      {},
    );
    expect(rows).toEqual([
      { slug: "ghost-form", status: ServiceStatus.FORM_DISABLED },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/ghost-form/);
    expect(warnings[0].toLowerCase()).toMatch(/no recipe|no matching|dangling/);
  });

  it("public info-only page (no form_id) → enabled + warning", () => {
    const { rows, warnings } = buildServiceStatusSeed(
      [{ slug: "about/contact", visibility: "public" }],
      {},
    );
    expect(rows).toEqual([
      { slug: "about/contact", status: ServiceStatus.ENABLED },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/about\/contact/);
    expect(warnings[0].toLowerCase()).toMatch(/info-only|no form/);
  });

  it("preview/draft page → disabled regardless of the form (keyed by form_id when declared)", () => {
    const map = statusBySlug(
      [
        { slug: "p", formId: "form-p", visibility: "preview" },
        { slug: "d", formId: "form-d", visibility: "draft" },
        { slug: "info", visibility: "draft" },
      ],
      { "form-p": "public", "form-d": "maintenance" },
    );
    expect(map["form-p"]).toBe(ServiceStatus.DISABLED);
    expect(map["form-d"]).toBe(ServiceStatus.DISABLED);
    expect(map["info"]).toBe(ServiceStatus.DISABLED);
  });

  it("form-only service (no content page): public → enabled, else → disabled, keyed by formId", () => {
    const map = statusBySlug([], {
      "lonely-public": "public",
      "lonely-preview": "preview",
      "lonely-draft": "draft",
      "lonely-maintenance": "maintenance",
    });
    expect(map["lonely-public"]).toBe(ServiceStatus.ENABLED);
    expect(map["lonely-preview"]).toBe(ServiceStatus.DISABLED);
    expect(map["lonely-draft"]).toBe(ServiceStatus.DISABLED);
    expect(map["lonely-maintenance"]).toBe(ServiceStatus.DISABLED);
  });
});

describe("buildServiceStatusSeed — reconciliation & determinism", () => {
  it("a form claimed by a content page is not also emitted as a form-only row", () => {
    const { rows } = buildServiceStatusSeed(
      [{ slug: "svc", formId: "shared-form", visibility: "public" }],
      { "shared-form": "public" },
    );
    // Exactly one row, keyed by the formId — no duplicate form-only entry.
    expect(rows).toEqual([
      { slug: "shared-form", status: ServiceStatus.ENABLED },
    ]);
  });

  it("throws on duplicate canonical slugs (two pages declaring the same form_id)", () => {
    expect(() =>
      buildServiceStatusSeed(
        [
          { slug: "page-one", formId: "dup-form", visibility: "public" },
          { slug: "page-two", formId: "dup-form", visibility: "preview" },
        ],
        { "dup-form": "public" },
      ),
    ).toThrow(/duplicate/i);
  });

  it("throws when an info-only page slug collides with a form-only formId", () => {
    expect(() =>
      buildServiceStatusSeed([{ slug: "collision", visibility: "public" }], {
        collision: "public",
      }),
    ).toThrow(/duplicate/i);
  });

  it("returns rows sorted by slug", () => {
    const { rows } = buildServiceStatusSeed(
      [
        { slug: "zebra", visibility: "public" },
        { slug: "alpha", visibility: "public" },
      ],
      { "mango-form": "public", "apple-form": "public" },
    );
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toEqual([...slugs].sort((a, b) => a.localeCompare(b)));
  });

  it("empty inputs → no rows, no warnings", () => {
    expect(buildServiceStatusSeed([], {})).toEqual({ rows: [], warnings: [] });
  });
});
