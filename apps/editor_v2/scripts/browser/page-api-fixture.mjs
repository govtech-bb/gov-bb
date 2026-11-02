import { randomUUID } from "node:crypto";
import { servicesFixture } from "./auth-fixture.mjs";

const stamp = "2026-10-07T12:00:00.000Z";

export const fixturePage = (id, fields) => ({
  id,
  title: id,
  url: "/business-trade/service/" + id,
  slug: id,
  parent_id: null,
  category_id: null,
  visibility: "draft",
  form_id: null,
  body_markdown: "Content for " + id,
  frontmatter: {},
  description: null,
  published_at: null,
  created_at: stamp,
  updated_at: stamp,
  pending_revision: null,
  last_edited_by: null,
  ...fields,
});

/** A row of `GET /editor/categories`, as the content API answers it; a subcategory takes its parent's row. */
export const fixtureCategory = (id, slug, title, fields = {}, parent) => ({
  id,
  parent_id: parent?.id ?? null,
  slug,
  title,
  description: null,
  url: parent ? `${parent.url}/${slug}` : `/${slug}`,
  position: 0,
  services: 0,
  reserved_route: false,
  updated_at: stamp,
  last_edited_by: null,
  ...fields,
});

/** HTTP-only page/service fixture. The real app still owns queries, working copies, guards and saves. */
export async function installPageApi(context, service, initialPages) {
  const pages = new Map(initialPages.map((page) => [page.id, page]));
  const services = new Map(servicesFixture.map((item) => [item.id, item]));
  services.set(service.id, service);
  const writes = [];
  let version = Date.parse(stamp);

  const category = fixtureCategory(
    "55555555-5555-4555-8555-555555555551",
    service.category.slug,
    service.category.title,
    { services: 1 },
  );

  const belongs = (page, id) => page.id === id || page.parent_id === id;

  const summary = (item) => {
    const children = [...pages.values()].filter((page) => belongs(page, item.id));

    return children.length
      ? {
          ...item,
          title: pages.get(item.id)?.title ?? item.title,
          page_count: children.length,
          has_start_page: children.some((page) => page.url.endsWith("/start")),
          updated_at: new Date(version).toISOString(),
        }
      : item;
  };

  await context.route("**/*", async (route) => {
    const request = route.request(),
      path = decodeURIComponent(new URL(request.url()).pathname);

    if (
      request.resourceType() === "document" ||
      !/^\/(services(?:\/[^?]+)?|pages(?:\/[^?]+)?|editor\/(categories|page-paths)|version)$/.test(
        path,
      )
    )
      return route.fallback();

    const headers = {
      "access-control-allow-origin": request.headers().origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, if-updated-at",
      "cache-control": "no-store",
    };

    const reply = (json, status = 200) => route.fulfill({ status, headers, json });

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });

    if (path === "/editor/categories") return reply({ categories: [category] });

    if (path === "/editor/page-paths")
      return reply([...new Set([...pages.values(), ...services.values()].map((page) => page.url))]);

    if (path === "/version")
      return reply({ count: pages.size, latest: new Date(version).toISOString() });

    if (path === "/services") return reply([...services.values()].map(summary));

    if (path.startsWith("/services/")) {
      const item = services.get(path.slice("/services/".length));

      return item
        ? reply({
            service: summary(item),
            pages: pages
              .values()
              .filter((page) => belongs(page, item.id))
              .map((page) => ({
                ...page,
                role:
                  page.id === item.id
                    ? "entry"
                    : page.url.endsWith("/start")
                      ? "start"
                      : "supporting",
              }))
              .toArray(),
          })
        : reply({}, 404);
    }

    if (request.method() === "POST" && path === "/pages") {
      const fields = request.postDataJSON(),
        id = randomUUID();

      const page = fixturePage(id, {
        ...fields,
        slug: fields.url.split("/").at(-1),
        updated_at: new Date(++version).toISOString(),
      });

      pages.set(id, page);

      if (!page.parent_id)
        services.set(id, { ...service, id, title: page.title, url: page.url, form_id: null });
      writes.push({ method: "POST", fields, id });

      return reply(page, 201);
    }

    const id = path.slice("/pages/".length),
      page = pages.get(id);

    if (!page) return reply({}, 404);

    if (request.method() === "GET") return reply(page);

    if (request.method() === "DELETE") {
      pages.delete(id);
      services.delete(id);
      version++;
      writes.push({ method: "DELETE", id });

      return route.fulfill({ status: 204, headers });
    }

    const fields = request.postDataJSON(),
      ifUpdatedAt = request.headers()["if-updated-at"];

    writes.push({ method: "PUT", id, fields, ifUpdatedAt });

    if (ifUpdatedAt !== page.updated_at) return reply({ error: "conflict" }, 409);
    const saved = { ...page, ...fields, updated_at: new Date(++version).toISOString() };
    pages.set(id, saved);

    return reply(saved);
  });

  return { pages, services, writes };
}
