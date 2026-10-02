import { LANDING_CATEGORIES, contentSlug } from "../../lib/content";
import type { ContentPageSummary } from "../../server/content";
import type { BuilderFormSummary } from "../../types";

export interface ServiceRow {
  key: string;
  serviceId?: string;
  updatedAt?: string;
  revision?: number;
  publishedRevision?: number | null;
  setupComplete?: boolean;
  title: string;
  category: string;
  subcategory: string;
  hasForm: boolean;
  formId: string;
  form?: BuilderFormSummary;
  contentRoot: string;
  searchText: string;
  pages: (ContentPageSummary & { kind?: "main" | "guidance" | "start" })[];
}

export function buildServiceRows(
  forms: BuilderFormSummary[],
  pages: ContentPageSummary[],
): ServiceRow[] {
  const bySlug = new Map(pages.map((page) => [contentSlug(page.path), page]));
  const byForm = new Map(forms.map((form) => [form.formId, form]));
  const roots = new Map<string, ContentPageSummary>();
  const rootForms = new Map<string, string>();
  for (const page of pages) {
    let root = page;
    let slug = contentSlug(page.path);
    while (slug.includes("/")) {
      slug = slug.slice(0, slug.lastIndexOf("/"));
      root = bySlug.get(slug) ?? root;
    }
    roots.set(page.path, root);
    if (root.formId || page.formId) {
      rootForms.set(
        root.path,
        root.formId || rootForms.get(root.path) || page.formId,
      );
    }
  }

  const grouped = new Map<
    string,
    { formId: string; pages: ContentPageSummary[] }
  >();
  for (const page of pages) {
    const root = roots.get(page.path)!;
    const matchingId = contentSlug(root.path).replaceAll("/", "-");
    const formId =
      page.formId ||
      rootForms.get(root.path) ||
      (byForm.has(matchingId) ? matchingId : "");
    const key = formId ? `form:${formId}` : `page:${root.path}`;
    const group = grouped.get(key) ?? { formId, pages: [] };
    group.pages.push(page);
    grouped.set(key, group);
  }
  for (const form of forms) {
    if (!grouped.has(`form:${form.formId}`)) {
      grouped.set(`form:${form.formId}`, { formId: form.formId, pages: [] });
    }
  }

  const rows = [...grouped].map(([key, group]): ServiceRow => {
    const form = byForm.get(group.formId);
    const rank = (page: ContentPageSummary) => {
      if (roots.get(page.path)?.path !== page.path) return 3;
      if (
        page.path.endsWith("/index.md") ||
        contentSlug(page.path).split("/").at(-1) === group.formId
      )
        return 0;
      return page.path.endsWith("/start.md") ? 2 : 1;
    };
    const servicePages = group.pages.sort(
      (a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path),
    );
    const main = servicePages[0];
    const title = form?.title || main?.title || group.formId;
    const category = main?.category || "";
    const contentRoot = main
      ? contentSlug(main.path).replace(/\/start$/, "")
      : group.formId;
    return {
      key,
      title,
      category,
      subcategory: main?.subcategory ?? "",
      hasForm: !!group.formId,
      formId: group.formId,
      form,
      contentRoot,
      searchText:
        `${title} ${group.formId} ${serviceCategory(category)} ${servicePages.map((page) => `${page.title} ${page.path}`).join(" ")}`.toLowerCase(),
      pages: servicePages,
    };
  });
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export function serviceCategory(category: string): string {
  return (
    LANDING_CATEGORIES.find((item) => item.slug === category)?.title ||
    category.replaceAll("-", " ") ||
    "Uncategorised"
  );
}

export function serviceStatus(service: ServiceRow): string {
  if (service.serviceId && service.revision !== service.publishedRevision)
    return "Draft";
  if (service.form?.isDisabled) return "Disabled";
  if (service.form) {
    if (!service.form.isPublished) return "Draft";
    return service.form.visibility === "draft"
      ? "Draft"
      : service.form.visibility === "preview"
        ? "Preview"
        : service.form.visibility === "maintenance"
          ? "Maintenance"
          : "Published";
  }
  const visibilities = service.pages.map((page) => page.visibility);
  if (visibilities.includes("public")) return "Published";
  if (visibilities.includes("preview")) return "Preview";
  return "Draft";
}

export function servicePageLabel(page: {
  path: string;
  title: string;
  kind?: string;
}): string {
  if (page.kind === "start" || (!page.kind && page.path.endsWith("/start.md")))
    return "Start page";
  if (page.kind === "main" || (!page.kind && page.path.endsWith("/index.md")))
    return "Entry page";
  return page.title || "Untitled page";
}
