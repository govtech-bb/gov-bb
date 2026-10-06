import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Employee } from "../modules/auth";
import { Redacted } from "../modules/redacted";
import { ROUTES } from "../openapi";
import type { EditorAccess } from "../services/editor-access";
import type { ApiStore, PageInput } from "../store";

/** The editor sends the exact millisecond timestamp from its last read. */
export const IF_UPDATED_AT = "if-updated-at";
/** Public content may be shared by the site and its caches. */
export const PUBLIC_READ =
  "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400";
/** Authenticated responses must never enter a browser or shared cache. */
export const EDITOR_READ = "no-store";
/** A short negative cache keeps missing public URLs inexpensive. */
export const NOT_FOUND_READ = "public, max-age=10";

/** Public page resolution and authenticated editor operations. */
export async function registerPageRoutes(
  app: FastifyInstance,
  store: ApiStore,
  access: EditorAccess,
  editorOrigin: string,
): Promise<void> {
  app.route<{ Querystring: { url: string } }>({
    ...ROUTES.getPageByUrl,
    handler: async (request, reply) => {
      const { url } = request.query;
      const resolved = await store.resolve(url);
      if (resolved.kind === "not_found") {
        return reply
          .header("Cache-Control", NOT_FOUND_READ)
          .status(404)
          .send({ error: "not_found", message: `No page at ${url}` });
      }
      reply.header("Cache-Control", PUBLIC_READ);
      if (resolved.kind === "redirect")
        return reply
          .status(301)
          .header("Location", resolved.url)
          .send({ redirect: resolved.url });
      return resolved.page;
    },
  });

  await app.register(async (editor) => {
    const employees = new WeakMap<FastifyRequest, Employee>();
    editor.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const cookie = request.headers.cookie;
      const employee = await access.requireEmployee(
        cookie === undefined ? undefined : new Redacted(cookie),
      );
      if (!employee.ok) {
        switch (employee.error._tag) {
          case "Unauthenticated":
            return reply.status(401).send({ error: "unauthenticated" });
          case "Forbidden":
            return reply.status(403).send({ error: "forbidden" });
          case "AuthUnavailable":
            request.log.error(
              { failure: "auth_unavailable" },
              "session lookup failed",
            );
            return reply.status(503).send({ error: "auth_unavailable" });
          default: {
            const unexpected: never = employee.error;
            throw unexpected;
          }
        }
      }
      if (
        !["GET", "HEAD"].includes(request.method) &&
        request.headers.origin !== editorOrigin
      ) {
        return reply.status(403).send({ error: "forbidden" });
      }
      employees.set(request, employee.value);
    });

    const actorId = (request: FastifyRequest): string => {
      const employee = employees.get(request);
      if (!employee)
        throw new Error("Editor route ran without an authenticated employee");
      return employee.id;
    };

    editor.route<{ Params: { id: string } }>({
      ...ROUTES.getPage,
      handler: async (request, reply) => {
        const document = await store.get(request.params.id);
        return (
          document ??
          reply.status(404).send({
            error: "not_found",
            message: `No page with id ${request.params.id}`,
          })
        );
      },
    });
    editor.route({ ...ROUTES.version, handler: async () => store.version() });
    editor.route<{ Body: PageInput }>({
      ...ROUTES.createPage,
      handler: async (request, reply) =>
        reply
          .status(201)
          .send(await store.create(request.body, actorId(request))),
    });
    editor.route<{ Params: { id: string }; Body: PageInput }>({
      ...ROUTES.savePage,
      handler: async (request) => {
        const header = request.headers[IF_UPDATED_AT];
        const condition = Array.isArray(header) ? header[0] : header;
        return store.save(
          request.params.id,
          request.body,
          condition || null,
          actorId(request),
        );
      },
    });
    editor.route<{ Params: { id: string } }>({
      ...ROUTES.deletePage,
      handler: async (request, reply) => {
        await store.delete(request.params.id);
        return reply.status(204).send();
      },
    });
  });
}
