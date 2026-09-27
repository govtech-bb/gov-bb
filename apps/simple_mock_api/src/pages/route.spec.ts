import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type { Element, Root, RootContent } from "hast";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import type { PageResponse } from "@govtech-bb/landing-v2-contract";
import { createApp } from "../app.js";
import { openDb } from "../db.js";
import { seed } from "../seed/index.js";

const SEED_DIR = fileURLToPath(new URL("../../seed", import.meta.url));
const BIRTH = "family-birth-relationships/get-birth-certificate";
const DEATH = "family-birth-relationships/get-death-certificate";

let db: DatabaseSync;
let app: Express;

beforeAll(async () => {
  db = openDb(":memory:");
  await seed(db, SEED_DIR);
  app = createApp(db);
});

function getPage(url?: string | string[]) {
  const req = request(app).get("/pages");
  return url === undefined ? req : req.query({ url });
}

function elements(nodes: RootContent[]): Element[] {
  return nodes.flatMap((node) =>
    node.type === "element" ? [node, ...elements(node.children)] : [],
  );
}

function textOf(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

function paragraphs(tree: Root): string[] {
  return elements(tree.children)
    .filter((el) => el.tagName === "p")
    .map(textOf);
}

function listItemCount(tree: Root): number {
  const ol = elements(tree.children).find((el) => el.tagName === "ol");
  return (ol?.children ?? []).filter(
    (child) => child.type === "element" && child.tagName === "li",
  ).length;
}

function startLinks(tree: Root): Element[] {
  return elements(tree.children).filter(
    (el) => el.tagName === "a" && el.properties.dataStartLink !== undefined,
  );
}

function hasPositionKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPositionKey);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, child]) => key === "position" || hasPositionKey(child),
    );
  }
  return false;
}

describe("GET /pages", () => {
  it("serves the birth service page with its online method kept", async () => {
    const res = await getPage(BIRTH);

    expect(res.status).toBe(200);
    const body = res.body as PageResponse;
    expect(body.url).toBe(BIRTH);
    expect(body.frontmatter.title).toBe("Get a copy of a birth certificate");
    expect(
      paragraphs(body.hast).some((p) => p.includes("There are 2 ways")),
    ).toBe(true);
    expect(listItemCount(body.hast)).toBe(2);
    expect(startLinks(body.hast).map((a) => a.properties.href)).toEqual([
      `/${BIRTH}/start`,
    ]);
  });

  it("serves the birth /start page with its form id baked into the Start link", async () => {
    const res = await getPage(`${BIRTH}/start`);

    expect(res.status).toBe(200);
    const body = res.body as PageResponse;
    expect(body.url).toBe(`${BIRTH}/start`);
    expect(startLinks(body.hast).map((a) => a.properties.dataFormId)).toEqual([
      "get-birth-certificate",
    ]);
  });

  it("returns the full breadcrumb trail for the birth /start page", async () => {
    const res = await getPage(`${BIRTH}/start`);

    expect((res.body as PageResponse).breadcrumbs).toEqual([
      {
        name: "Family, birth and relationships",
        url: "family-birth-relationships",
      },
      {
        name: "Get a copy of a birth certificate",
        url: "family-birth-relationships/get-birth-certificate",
      },
      {
        name: "Get a copy of a birth certificate",
        url: "family-birth-relationships/get-birth-certificate/start",
      },
    ]);
  });

  it("removes the death page's online method because its form is not public", async () => {
    const res = await getPage(DEATH);

    expect(res.status).toBe(200);
    const { hast } = res.body as PageResponse;
    expect(startLinks(hast)).toEqual([]);
    expect(listItemCount(hast)).toBe(1);
    expect(paragraphs(hast).some((p) => p.includes("There is 1 way"))).toBe(
      true,
    );
    expect(paragraphs(hast).some((p) => p.includes("There are 2 ways"))).toBe(
      false,
    );
  });

  it("404s the death /start page because its form is not public", async () => {
    const res = await getPage(`${DEATH}/start`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Page not found" });
  });

  it.each([
    ["get-birth-certificate", `/${BIRTH}`],
    ["get-death-certificate", `/${DEATH}`],
  ])(
    "301s the bare slug %s to its category-prefixed URL",
    async (slug, target) => {
      const res = await getPage(slug);

      expect(res.status).toBe(301);
      expect(res.headers.location).toBe(target);
      expect(res.body).toEqual({ redirect: target });
    },
  );

  it.each(["nope", "start", "family-birth-relationships/nope"])(
    "404s the unknown url %s",
    async (url) => {
      const res = await getPage(url);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Page not found" });
    },
  );

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["repeated", ["a", "b"]],
  ])("400s when the url parameter is %s", async (_label, url) => {
    const res = await getPage(url);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it("tolerates leading and trailing slashes", async () => {
    const res = await getPage(`/${BIRTH}/`);

    expect(res.status).toBe(200);
    expect((res.body as PageResponse).url).toBe(BIRTH);
  });

  it.each([BIRTH, `${BIRTH}/start`, DEATH])(
    "leaves no position data anywhere in the %s response",
    async (url) => {
      const res = await getPage(url);

      expect(res.status).toBe(200);
      expect(hasPositionKey(res.body)).toBe(false);
    },
  );

  // The cases below mutate the shared database, so they run last and each
  // restores its row before the next one runs.
  it("gates a service's pages and bare slug on the service page's visibility", async () => {
    expect((await getPage(`${BIRTH}/start`)).status).toBe(200);
    expect((await getPage("get-birth-certificate")).status).toBe(301);

    db.prepare(
      "UPDATE pages SET visibility = 'preview' WHERE slug = 'get-birth-certificate'",
    ).run();
    try {
      expect((await getPage(BIRTH)).status).toBe(404);
      expect((await getPage(`${BIRTH}/start`)).status).toBe(404);

      const bare = await getPage("get-birth-certificate");
      expect(bare.status).toBe(404);
      expect(bare.headers.location).toBeUndefined();
    } finally {
      db.prepare(
        "UPDATE pages SET visibility = 'public' WHERE slug = 'get-birth-certificate'",
      ).run();
    }
  });

  it("treats a form with no forms row as not public", async () => {
    expect(startLinks((await getPage(BIRTH)).body.hast)).toHaveLength(1);
    expect((await getPage(`${BIRTH}/start`)).status).toBe(200);

    db.prepare(
      "DELETE FROM forms WHERE form_id = 'get-birth-certificate'",
    ).run();
    try {
      const res = await getPage(BIRTH);
      expect(res.status).toBe(200);
      const { hast } = res.body as PageResponse;
      expect(startLinks(hast)).toEqual([]);
      expect(listItemCount(hast)).toBe(1);

      expect((await getPage(`${BIRTH}/start`)).status).toBe(404);
    } finally {
      db.prepare(
        "INSERT INTO forms (form_id, visibility) VALUES ('get-birth-certificate', 'public')",
      ).run();
    }
  });

  it("hides the online method when only the /start page is not public", async () => {
    expect(startLinks((await getPage(BIRTH)).body.hast)).toHaveLength(1);
    expect((await getPage(`${BIRTH}/start`)).status).toBe(200);

    db.prepare(
      "UPDATE pages SET visibility = 'preview' WHERE slug = 'get-birth-certificate/start'",
    ).run();
    try {
      const res = await getPage(BIRTH);
      expect(res.status).toBe(200);
      const { hast } = res.body as PageResponse;
      expect(startLinks(hast)).toEqual([]);
      expect(listItemCount(hast)).toBe(1);

      expect((await getPage(`${BIRTH}/start`)).status).toBe(404);
      expect((await getPage("get-birth-certificate")).status).toBe(301);
    } finally {
      db.prepare(
        "UPDATE pages SET visibility = 'public' WHERE slug = 'get-birth-certificate/start'",
      ).run();
    }
  });
});
