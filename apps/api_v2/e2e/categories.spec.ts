import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EditorCategory } from "../src/modules/category";
import { CategoryListing } from "../src/modules/navigation";
import { z } from "zod";

const categoryList = z.strictObject({ categories: z.array(EditorCategory) });
import {
  AUTH_ENV,
  createEmployeeSession,
  createScratchDatabase,
  dropScratchDatabase,
  HAS_DATABASE,
  startServer,
  type Server,
} from "./support";

describe.skipIf(!HAS_DATABASE)("category management over HTTP", () => {
  let server: Server;
  let database: string;
  let cookie: string;
  beforeAll(async () => {
    database = await createScratchDatabase();
    server = await startServer({ DB_NAME: database, SEED: "false" });
    // An approver, since these sessions create and delete public pages.
    cookie = (
      await createEmployeeSession(database, server.url, {
        roles: ["approver"],
      })
    ).cookie;
  });
  afterAll(async () => {
    await server?.stop();
    if (database) await dropScratchDatabase(database);
  });

  const send = (method: string, path: string, body?: object, stamp?: string) =>
    fetch(server.url + path, {
      method,
      headers: {
        cookie,
        origin: AUTH_ENV.EDITOR_ORIGIN,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(stamp ? { "if-updated-at": stamp } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const fields = (slug: string, parent_id: string | null = null) => ({
    title: slug,
    slug,
    parent_id,
    description: null,
  });
  const create = async (slug: string, parent_id: string | null = null) => {
    const response = await send(
      "POST",
      "/editor/categories",
      fields(slug, parent_id),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    return EditorCategory.parse(await response.json());
  };

  it("persists create, edit, reparent, reorder and deletion across process restart", async () => {
    const a = await create("socket-a");
    const b = await create("socket-b");
    const child = await create("socket-child", a.id);
    const moved = await send(
      "PUT",
      `/editor/categories/${child.id}`,
      {
        ...fields(child.slug, b.id),
        title: "Changed",
        description: "  Saved  ",
      },
      child.updated_at,
    );
    expect(moved.status).toBe(200);
    const saved = EditorCategory.parse(await moved.json());
    expect(saved).toMatchObject({
      title: "Changed",
      description: "Saved",
      url: "/socket-b/socket-child",
    });
    const order = await send("PUT", "/editor/categories/order", {
      parent_id: null,
      expected: [a, b].map(({ id, updated_at }) => ({ id, updated_at })),
      ordered_ids: [b.id, a.id],
    });
    expect(order.status).toBe(200);
    const ordered = categoryList.parse(await order.json());
    expect(Object.keys(ordered)).toEqual(["categories"]);
    expect(ordered.categories.map((row: { id: string }) => row.id)).toEqual([
      b.id,
      a.id,
    ]);
    await server.stop();
    server = await startServer({ DB_NAME: database, SEED: "false" });
    const reopened = await send("GET", "/editor/categories");
    expect(reopened.status).toBe(200);
    expect(categoryList.parse(await reopened.json()).categories).toEqual([
      ordered.categories[0],
      saved,
      ordered.categories[1],
    ]);
    expect(
      (
        await send(
          "DELETE",
          `/editor/categories/${saved.id}`,
          undefined,
          saved.updated_at,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await send(
          "DELETE",
          `/editor/categories/${saved.id}`,
          undefined,
          saved.updated_at,
        )
      ).status,
    ).toBe(404);
    expect(
      (await fetch(server.url + "/categories/socket-a/socket-child")).status,
    ).toBe(404);
    expect(await (await send("GET", "/version")).json()).toEqual({
      count: 0,
      latest: null,
    });
  });

  it("refuses stale and occupied operations while keeping public responses private-data free", async () => {
    const category = await create("socket-public");
    const edited = await send(
      "PUT",
      `/editor/categories/${category.id}`,
      { ...fields(category.slug), title: "Renamed" },
      category.updated_at,
    );
    const current = EditorCategory.parse(await edited.json());
    for (const method of ["PUT", "DELETE"]) {
      const response = await send(
        method,
        `/editor/categories/${category.id}`,
        method === "PUT" ? fields(category.slug) : undefined,
        category.updated_at,
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "conflict",
        message: expect.any(String),
      });
    }
    for (const visibility of ["public", "draft"]) {
      expect(
        (
          await send("POST", "/pages", {
            url: `/socket-public/${visibility}`,
            category_id: current.id,
            title: visibility,
            visibility,
            body_markdown: "Content",
          })
        ).status,
      ).toBe(201);
    }
    const blocked = await send(
      "DELETE",
      `/editor/categories/${current.id}`,
      undefined,
      current.updated_at,
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toEqual({
      error: "category_in_use",
      message: expect.any(String),
      blockers: { pages: 2, subcategories: 0, reserved_route: false },
    });
    const publicTree = await fetch(server.url + "/categories");
    expect(publicTree.headers.get("cache-control")).toContain("max-age=60");
    expect(await publicTree.json()).toEqual({
      categories: [
        {
          title: "Renamed",
          slug: current.slug,
          description: null,
          url: current.url,
          subcategories: [],
        },
      ],
    });
    const listing = await fetch(server.url + "/categories/socket-public");
    expect(CategoryListing.parse(await listing.json()).pages).toEqual([
      {
        url: "/socket-public/public",
        title: "public",
        description: null,
        digital: false,
      },
    ]);
  });

  it("enforces auth and Origin before validation on every management route", async () => {
    for (const [method, path] of [
      ["GET", "/editor/categories"],
      ["POST", "/editor/categories"],
      ["PUT", "/editor/categories/order"],
      ["PUT", "/editor/categories/not-a-uuid"],
      ["DELETE", "/editor/categories/not-a-uuid"],
    ]) {
      const anonymous = await fetch(server.url + path, {
        method,
        headers: { origin: AUTH_ENV.EDITOR_ORIGIN },
      });
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get("cache-control")).toBe("no-store");
      expect(anonymous.headers.has("etag")).toBe(false);
      if (method !== "GET") {
        const forbidden = await fetch(server.url + path, {
          method,
          headers: { cookie, origin: "https://evil.example" },
        });
        expect(forbidden.status).toBe(403);
      }
    }
    expect((await fetch(server.url + "/taxonomy")).status).toBe(404);
  });

  it("distinguishes bad transport, field rules, reserved addresses and anchored deletion", async () => {
    expect(
      (
        await send("POST", "/editor/categories", {
          ...fields("valid"),
          extra: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("POST", "/editor/categories", {
          ...fields("valid"),
          title: " ",
        })
      ).status,
    ).toBe(422);
    expect(
      (await send("POST", "/editor/categories", fields("cms-preview"))).status,
    ).toBe(422);
    const anchor = await create("health-and-emergency-services");
    expect(anchor.reserved_route).toBe(true);
    const missing = await send("DELETE", `/editor/categories/${anchor.id}`);
    expect(missing.status).toBe(400);
    const blocked = await send(
      "DELETE",
      `/editor/categories/${anchor.id}`,
      undefined,
      anchor.updated_at,
    );
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      error: "category_in_use",
      blockers: { pages: 0, subcategories: 0, reserved_route: true },
    });
    expect(
      (
        await send(
          "PUT",
          `/editor/categories/${anchor.id}`,
          { ...fields(anchor.slug), slug: "moved" },
          anchor.updated_at,
        )
      ).status,
    ).toBe(422);
  });
});
