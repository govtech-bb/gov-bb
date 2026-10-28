import type { FastifyRequest } from "fastify";
import type { ICategoryEditing } from "../services/category-editing";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Employee, Role } from "../modules/auth";
import { Redacted } from "../modules/redacted";
import type { EmployeeGate, RoleRecords } from "../services/editor-access";
import type { EditorIndex } from "../services/editor-index";
import type { PageEditing } from "../services/page-editing";
import { editorCategoryRoutes } from "./categories";
import { IF_UPDATED_AT, SCHEMAS } from "./contracts";
import { EDITOR_READ, rejected, storageFailed } from "./responses";
import { editorRoleRoutes } from "./roles";

declare module "fastify" {
  interface FastifyContextConfig {
    /**
     * The role a route needs (ADR 0079). Every write route names one, and
     * a read may; the editor scope refuses a write that names none, so a new
     * route fails closed rather than open.
     */
    role?: Role;
  }
}

/** Why an employee without the role a route needs is refused. */
const NEEDS_ROLE: Readonly<Record<Role, string>> = {
  editor: "You need the editor role to make changes. Ask an admin to grant it.",
  approver: "Only approvers can do this.",
  admin: "Only admins can see or change who has which role.",
};

/** Authenticated editor operations, behind an employee session, the editor's Origin and the route's role. */
export const editorRoutes: FastifyPluginAsyncZod<{
  editing: PageEditing;
  index: EditorIndex;
  categories: ICategoryEditing;
  access: EmployeeGate;
  roles: RoleRecords;
  editorOrigin: string;
}> = async (
  editor,
  { editing, index, categories, access, roles, editorOrigin },
) => {
  editor.decorateRequest("employee", null);
  editor.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", EDITOR_READ);
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
          // Which lookup failed, never the driver's message: it can carry SQL parameters.
          request.log.error(
            employee.error.failure.lookup === "roles"
              ? {
                  failure: "role_store_unavailable",
                  operation: employee.error.failure.operation,
                }
              : { failure: "auth_unavailable" },
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
    const { role } = request.routeOptions.config;
    // Fail closed: a write route that names no role is a bug, which
    // route-auth.test.ts catches before it ships.
    if (role === undefined && !["GET", "HEAD"].includes(request.method))
      return reply.status(403).send({
        error: "forbidden",
        message: "Nobody can make this change: its route names no role.",
      });
    if (role !== undefined && !employee.value.roles.includes(role))
      return reply
        .status(403)
        .send({ error: "forbidden", message: NEEDS_ROLE[role] });
    request.setDecorator("employee", employee.value);
  });

  /** The employee the onRequest hook admitted; every editor route runs after it. */
  const actor = (request: FastifyRequest): Employee => {
    const employee = request.getDecorator<Employee | null>("employee");
    if (!employee)
      throw new Error("Editor route ran without an authenticated employee");
    return employee;
  };

  editor.route({
    method: "GET",
    url: "/pages/:id",
    schema: SCHEMAS.getPage,
    handler: async (request, reply) => {
      const found = await editing.open(request.params.id);
      if (!found.ok)
        return reply.status(500).send(storageFailed(request.log, found.error));
      return (
        found.value ??
        reply.status(404).send({
          error: "not_found",
          message: `No page with id ${request.params.id}`,
        })
      );
    },
  });
  editor.route({
    method: "GET",
    url: "/pages/:id/revision",
    schema: SCHEMAS.getRevision,
    handler: async (request, reply) => {
      const found = await editing.revision(request.params.id);
      if (!found.ok)
        return reply.status(500).send(storageFailed(request.log, found.error));
      return (
        found.value ??
        reply.status(404).send({
          error: "not_found",
          message: `No pending revision for page ${request.params.id}`,
        })
      );
    },
  });
  editor.route({
    method: "GET",
    url: "/services",
    schema: SCHEMAS.listServices,
    handler: async (request, reply) => {
      const services = await index.listServices();
      return services.ok
        ? services.value
        : reply.status(500).send(storageFailed(request.log, services.error));
    },
  });
  editor.route({
    method: "GET",
    url: "/services/:id",
    schema: SCHEMAS.getService,
    handler: async (request, reply) => {
      const found = await index.service(request.params.id);
      if (!found.ok)
        return reply.status(500).send(storageFailed(request.log, found.error));
      return (
        found.value ??
        reply.status(404).send({
          error: "not_found",
          message: `No service with entry page ${request.params.id}`,
        })
      );
    },
  });
  await editor.register(editorCategoryRoutes, { categories, actor });
  await editor.register(editorRoleRoutes, { roles, actor });
  editor.route({
    method: "GET",
    url: "/editor/me",
    schema: SCHEMAS.me,
    handler: async (request) => {
      const { roles: held, ...employee } = actor(request);
      return { ...employee, roles: [...held] };
    },
  });
  editor.route({
    method: "GET",
    url: "/version",
    schema: SCHEMAS.version,
    handler: async (request, reply) => {
      const version = await index.version();
      return version.ok
        ? version.value
        : reply.status(500).send(storageFailed(request.log, version.error));
    },
  });
  editor.route({
    method: "POST",
    url: "/pages",
    schema: SCHEMAS.createPage,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const created = await editing.create(request.body, actor(request));
      // A new page has no pending revision.
      if (created.ok)
        return reply
          .status(201)
          .send({ ...created.value, pending_revision: null });
      switch (created.error._tag) {
        case "PageRejected":
          return reply.status(422).send(rejected(created.error));
        case "NotApprover":
          return reply
            .status(403)
            .send({ error: "forbidden", message: created.error.message });
        case "ContentStoreUnavailable":
          return reply
            .status(500)
            .send(storageFailed(request.log, created.error));
        default: {
          const unexpected: never = created.error;
          throw unexpected;
        }
      }
    },
  });
  editor.route({
    method: "PUT",
    url: "/pages/:id",
    schema: SCHEMAS.savePage,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const saved = await editing.save(
        request.params.id,
        request.body,
        request.headers[IF_UPDATED_AT] ?? null,
        actor(request),
      );
      if (saved.ok) return saved.value;
      switch (saved.error._tag) {
        case "PageRejected":
          return reply.status(422).send(rejected(saved.error));
        case "PageNotFound":
          return reply
            .status(404)
            .send({ error: "not_found", message: saved.error.message });
        case "NotApprover":
          return reply
            .status(403)
            .send({ error: "forbidden", message: saved.error.message });
        case "PageConflict":
          return reply.status(409).send({
            error: "conflict",
            message: saved.error.message,
            documentId: saved.error.documentId,
          });
        case "ContentStoreUnavailable":
          return reply
            .status(500)
            .send(storageFailed(request.log, saved.error));
        default: {
          const unexpected: never = saved.error;
          throw unexpected;
        }
      }
    },
  });
  editor.route({
    method: "DELETE",
    url: "/pages/:id",
    schema: SCHEMAS.deletePage,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const deleted = await editing.delete(request.params.id, actor(request));
      if (deleted.ok) return reply.status(204).send();
      switch (deleted.error._tag) {
        case "PageRejected":
          return reply.status(422).send(rejected(deleted.error));
        case "NotApprover":
          return reply
            .status(403)
            .send({ error: "forbidden", message: deleted.error.message });
        case "ContentStoreUnavailable":
          return reply
            .status(500)
            .send(storageFailed(request.log, deleted.error));
        default: {
          const unexpected: never = deleted.error;
          throw unexpected;
        }
      }
    },
  });
};
