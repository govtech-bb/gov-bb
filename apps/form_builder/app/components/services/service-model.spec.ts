import { buildServiceRows, serviceStatus } from "./service-model";
import type { BuilderFormSummary } from "../../types";
import type { ContentPageSummary } from "../../server/content";

const form: BuilderFormSummary = {
  id: "alpha",
  formId: "alpha",
  title: "Alpha service",
  version: "1.0.0",
  isPublished: true,
};
const page: ContentPageSummary = {
  path: "apps/landing/src/content/health/alpha.md",
  title: "Alpha page",
  category: "health",
  visibility: "public",
  formId: "alpha",
  hasFormButton: true,
};

it("groups linked pages, preserves duplicate and standalone pages, and keeps disabled forms reachable", () => {
  const orphan = {
    ...form,
    id: "orphan",
    formId: "orphan",
    isPublished: false,
    isDisabled: true,
    isOrphanOverride: true,
  };
  const duplicate = {
    ...page,
    path: "apps/landing/src/content/health/alpha-copy.md",
  };
  const standalone = {
    ...page,
    path: "apps/landing/src/content/health/advice.md",
    formId: "",
  };
  const unlisted = {
    ...page,
    path: "apps/landing/src/content/health/unlisted/start.md",
    formId: "unlisted",
  };
  const rows = buildServiceRows(
    [form, orphan],
    [page, duplicate, standalone, unlisted],
  );

  expect(rows.find((row) => row.key === "form:alpha")).toMatchObject({
    title: form.title,
    form,
    pages: [page, duplicate],
  });
  expect(
    rows.flatMap((row) => row.pages.map((page) => page.path)).sort(),
  ).toEqual(
    [page, duplicate, standalone, unlisted].map((page) => page.path).sort(),
  );
  expect(rows.find((row) => row.key === "form:orphan")?.form).toEqual(orphan);
  expect(rows.find((row) => row.key === "form:unlisted")?.pages).toHaveLength(
    1,
  );
  expect(
    rows.find((row) => row.key === `page:${standalone.path}`)?.hasForm,
  ).toBe(false);
});

it("allows a form without forced page slots and derives status from actual state", () => {
  const [draft] = buildServiceRows([{ ...form, isPublished: false }], []);
  expect(draft.pages).toEqual([]);
  expect(serviceStatus(draft)).toBe("Draft");
  expect(
    serviceStatus(buildServiceRows([{ ...form, isDisabled: true }], [page])[0]),
  ).toBe("Disabled");
  expect(
    serviceStatus(
      buildServiceRows([{ ...form, visibility: "preview" }], [page])[0],
    ),
  ).toBe("Preview");
  expect(
    serviceStatus(
      buildServiceRows([], [{ ...page, formId: "", visibility: "draft" }])[0],
    ),
  ).toBe("Draft");
  expect(
    serviceStatus(buildServiceRows([], [{ ...page, formId: "" }])[0]),
  ).toBe("Published");
});

it("groups a main page, legacy start and multiple guidance pages under one form", () => {
  const paths = [
    "alpha/index.md",
    "alpha/start.md",
    "alpha/help.md",
    "alpha/eligibility.md",
  ];
  const pages = paths.map((path, i) => ({
    ...page,
    path: `apps/landing/src/content/${path}`,
    formId: i === 0 ? "alpha" : "",
  }));
  const rows = buildServiceRows([form], pages);
  expect(rows).toHaveLength(1);
  expect(rows[0].contentRoot).toBe("alpha");
  expect(rows[0].pages).toHaveLength(4);
  expect(rows[0].pages[0].path).toBe(pages[0].path);
});

it("retains content-only journeys and attaches their single form when it is created", () => {
  const pages = ["health/alpha/index.md", "health/alpha/help.md"].map(
    (path) => ({
      ...page,
      formId: "",
      path: `apps/landing/src/content/${path}`,
    }),
  );
  const standalone = {
    ...page,
    formId: "",
    path: "apps/landing/src/content/health/another.md",
  };
  const rows = buildServiceRows([], [...pages, standalone]);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.pages.length === 2)).toMatchObject({
    formId: "",
    contentRoot: "health/alpha",
  });
  const attached = buildServiceRows(
    [{ ...form, formId: "health-alpha" }],
    pages,
  );
  expect(attached).toHaveLength(1);
  expect(attached[0]).toMatchObject({ formId: "health-alpha", pages });
});
