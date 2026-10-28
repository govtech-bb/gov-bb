import { fork } from "node:child_process";
import { resolve } from "node:path";
import { test, expect } from "vitest";
import { z } from "zod";
import { EmployeeId } from "../src/modules/auth";
import { PageDocument } from "../src/modules/page";
import { ok } from "../src/modules/result";
import { createTestApp, createTestDb, TEST_EMPLOYEE } from "../src/test-db";

const commandSchema = z.object({
  action: z.enum([
    "ready",
    "idle-prompt",
    "idle-expire",
    "expire-auth",
    "restore-auth",
    "change-unsupported",
  ]),
});

test("real browser sessions obey PostgreSQL versions, ownership, expiry and reviewed deletion", async () => {
  const editorOrigin = z
    .url()
    .parse(process.env.BROWSER_BASE_URL ?? "http://127.0.0.1:3018/");
  const apiOrigin = "http://127.0.0.1:3038";
  const database = await createTestDb();
  let expired = false;
  const secondEmployee = {
    ...TEST_EMPLOYEE,
    id: EmployeeId.parse("second-browser-editor"),
    name: "Second employee",
    email: "second@govtech.bb",
  };
  const app = await createTestApp(database.db, {
    config: { editorOrigin: new URL(editorOrigin).origin, apiOrigin },
    sessions: {
      findSession: async (credential) => {
        const cookie = credential.reveal();
        return ok(
          cookie.includes("browser-employee=two")
            ? secondEmployee
            : cookie.includes("browser-employee=one") && !expired
              ? TEST_EMPLOYEE
              : null,
        );
      },
    },
    auth: {
      handle: async (request) => {
        const second = request.headers
          .get("cookie")
          ?.includes("browser-employee=two");
        if (expired && !second) return Response.json(null);
        const employee = second ? secondEmployee : TEST_EMPLOYEE;
        const stamp = new Date().toISOString();
        return Response.json({
          session: {
            id: "browser-session",
            userId: employee.id,
            token: "fixture-login-token",
            createdAt: stamp,
            updatedAt: stamp,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
          user: {
            id: employee.id,
            name: employee.name,
            email: employee.email,
            emailVerified: true,
            image: null,
            createdAt: stamp,
            updatedAt: stamp,
          },
        });
      },
    },
  });
  let child: ReturnType<typeof fork> | undefined;
  try {
    const categoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await database.pool.query(
      "insert into categories(id, slug, title, position) values($1, 'browser-test', 'Browser test', 1)",
      [categoryId],
    );
    const headers = {
      cookie: "browser-employee=one",
      origin: new URL(editorOrigin).origin,
    };
    const create = async (payload: Record<string, unknown>) => {
      const response = await app.inject({
        method: "POST",
        url: "/pages",
        headers,
        payload,
      });
      expect(response.statusCode, response.body).toBe(201);
      return PageDocument.parse(response.json());
    };
    const service = await create({
      url: "/browser-test/service",
      category_id: categoryId,
      title: "Concurrent editing test",
      visibility: "draft",
      body_markdown: "Entry page",
    });
    const page = await create({
      url: "/browser-test/service/fees",
      parent_id: service.id,
      title: "Concurrent fees",
      visibility: "draft",
      body_markdown: "Original fees",
    });
    const unsupported = await create({
      url: "/browser-test/service/unsupported",
      parent_id: service.id,
      title: "Unsupported page",
      visibility: "draft",
      body_markdown: "<!-- Keep this authored HTML -->",
    });
    await app.listen({ host: "127.0.0.1", port: 3038 });
    const suite = resolve(
      __dirname,
      "../../editor_v2/scripts/browser/concurrent-page-editing.mjs",
    );
    child = fork(suite, [editorOrigin], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const browser = child;
    let output = "";
    browser.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    browser.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    await new Promise<void>((resolve, reject) => {
      browser.on("error", reject);
      browser.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(`Concurrent browser failed (${code}):\n${output}`),
            ),
      );
      browser.on("message", (message) => {
        void (async () => {
          const command = commandSchema.parse(message);
          switch (command.action) {
            case "ready":
              browser.send({
                apiOrigin,
                serviceId: service.id,
                pageId: page.id,
                unsupportedId: unsupported.id,
              });
              return;
            case "expire-auth":
              expired = true;
              break;
            case "restore-auth":
              expired = false;
              break;
            case "idle-prompt":
            case "idle-expire": {
              const idle = command.action === "idle-prompt" ? 601 : 718;
              const remaining = command.action === "idle-prompt" ? 119 : 2;
              await database.pool.query(
                "update page_edit_locks set last_activity_at = clock_timestamp() - $2 * interval '1 second', lock_expires_at = clock_timestamp() + $3 * interval '1 second', activity_sequence = activity_sequence + 1000 where page_id = $1",
                [page.id, idle, remaining],
              );
              break;
            }
            case "change-unsupported":
              await database.pool.query(
                "update content_pages set body_markdown = '<!-- Updated authored HTML -->' where id = $1",
                [unsupported.id],
              );
              break;
          }
          browser.send({ done: command.action });
        })().catch(reject);
      });
    });
    expect(output).toContain("PASS real API concurrent editing");
  } finally {
    child?.kill();
    await app.close();
    await database.close();
  }
});
