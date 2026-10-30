import type { FastifyReply, FastifyRequest } from "fastify";
import type { ICategoryEditing } from "../services/category-editing";
import type { CollectionEditing } from "../services/collection-editing";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type {
  Employee,
  NotApprover,
  Role,
  SelfApproval,
} from "../modules/auth";
import type {
  ContentStoreUnavailable,
  PageNotFound,
  PageRejected,
  PageVersionConflict,
  RevisionNotFound,
  RevisionStateConflict,
} from "../modules/page";
import {
  PageEditLockRequired,
  type PageEditLockConflict,
  type PageEditLockLost,
} from "../modules/page-edit-lock";
import { Redacted } from "../modules/redacted";
import type { EmployeeGate, RoleRecords } from "../services/editor-access";
import type { EditorIndex } from "../services/editor-index";
import type { PageEditing } from "../services/page-editing";
import { editorCategoryRoutes } from "./categories";
import { editorCollectionRoutes } from "./collections";
import { PAGE_EDIT_LOCK_HEADER, SCHEMAS } from "./contracts";
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
  approver: "You need the approver role to do this.",
  admin: "Only admins can see or change who has which role.",
};

/** Why a page write, review step or edit lease step was refused, as its response. Never echoes a lease token. */
function pageRefused(
  request: FastifyRequest,
  reply: FastifyReply,
  error:
    | PageNotFound
    | RevisionNotFound
    | PageVersionConflict
    | PageEditLockRequired
    | PageEditLockLost
    | PageEditLockConflict
    | RevisionStateConflict
    | NotApprover
    | SelfApproval
    | PageRejected
    | ContentStoreUnavailable,
) {
  switch (error._tag) {
    case "PageNotFound":
    case "RevisionNotFound":
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    case "PageVersionConflict":
      return reply.status(409).send({
        error: "page_version_conflict",
        message: error.message,
        pageId: error.pageId,
      });
    case "PageEditLockRequired":
      return reply.status(409).send({
        error: "page_edit_lock_required",
        message: error.message,
        pageId: error.pageId,
      });
    case "PageEditLockLost":
      return reply.status(409).send({
        error: "page_edit_lock_lost",
        message: error.message,
        pageId: error.pageId,
      });
    case "PageEditLockConflict":
      return reply.status(409).send({
        error: "page_edit_lock_conflict",
        message: error.message,
        pageId: error.pageId,
      });
    case "RevisionStateConflict":
      return reply
        .status(409)
        .send({ error: error.reason, message: error.message });
    case "NotApprover":
    case "SelfApproval":
      return reply
        .status(403)
        .send({ error: "forbidden", message: error.message });
    case "PageRejected":
      return reply.status(422).send(rejected(error));
    case "ContentStoreUnavailable":
      return reply.status(500).send(storageFailed(request.log, error));
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
}

/** Authenticated editor operations, behind an employee session, the editor's Origin and the route's role. */
export const editorRoutes: FastifyPluginAsyncZod<{
  editing: PageEditing;
  index: EditorIndex;
  categories: ICategoryEditing;
  collections: CollectionEditing;
  access: EmployeeGate;
  roles: RoleRecords;
  editorOrigin: string;
}> = async (
  editor,
  { editing, index, categories, collections, access, roles, editorOrigin },
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
    url: "/pages/:id/history",
    schema: SCHEMAS.getPageHistory,
    handler: async (request, reply) => {
      const history = await index.history(request.params.id);
      if (!history.ok)
        return reply
          .status(500)
          .send(storageFailed(request.log, history.error));
      return history.value.length > 0
        ? { entries: history.value }
        : reply.status(404).send({
            error: "not_found",
            message: `No history for page ${request.params.id}`,
          });
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
    url: "/revisions",
    schema: SCHEMAS.listRevisions,
    handler: async (request, reply) => {
      const queue = await index.reviewQueue();
      return queue.ok
        ? { revisions: queue.value }
        : reply.status(500).send(storageFailed(request.log, queue.error));
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
  await editor.register(editorCollectionRoutes, { collections, actor });
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
        case "SelfApproval":
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
      const token = request.headers[PAGE_EDIT_LOCK_HEADER];
      if (token === undefined)
        return pageRefused(
          request,
          reply,
          new PageEditLockRequired(request.params.id),
        );
      const { version, ...fields } = request.body;
      const saved = await editing.save(
        request.params.id,
        fields,
        version,
        token,
        actor(request),
      );
      return saved.ok ? saved.value : pageRefused(request, reply, saved.error);
    },
  });
  editor.route({
    method: "POST",
    url: "/pages/:id/revision/submit",
    schema: SCHEMAS.submitRevision,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const submitted = await editing.submit(
        request.params.id,
        request.body.version,
        actor(request),
      );
      return submitted.ok
        ? submitted.value
        : pageRefused(request, reply, submitted.error);
    },
  });
  editor.route({
    method: "POST",
    url: "/pages/:id/revision/reject",
    schema: SCHEMAS.rejectRevision,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const decided = await editing.reject(
        request.params.id,
        request.body.comment,
        request.body.version,
        actor(request),
      );
      return decided.ok
        ? decided.value
        : pageRefused(request, reply, decided.error);
    },
  });
  editor.route({
    method: "POST",
    url: "/pages/:id/revision/publish",
    schema: SCHEMAS.publishRevision,
    config: { role: "approver" },
    handler: async (request, reply) => {
      const published = await editing.publish(
        request.params.id,
        request.body.version,
        actor(request),
      );
      return published.ok
        ? published.value
        : pageRefused(request, reply, published.error);
    },
  });
  editor.route({
    method: "DELETE",
    url: "/pages/:id",
    schema: SCHEMAS.deletePage,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const token = request.headers[PAGE_EDIT_LOCK_HEADER];
      if (token === undefined)
        return pageRefused(
          request,
          reply,
          new PageEditLockRequired(request.params.id),
        );
      const deleted = await editing.delete(
        request.params.id,
        request.query.version,
        token,
        actor(request),
      );
      return deleted.ok
        ? reply.status(204).send()
        : pageRefused(request, reply, deleted.error);
    },
  });
  editor.route({
    method: "GET",
    url: "/pages/:id/lock",
    schema: SCHEMAS.readPageEditLock,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const status = await editing.readPageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
      );
      return status.ok
        ? status.value
        : pageRefused(request, reply, status.error);
    },
  });
  editor.route({
    method: "POST",
    url: "/pages/:id/lock",
    schema: SCHEMAS.acquirePageEditLock,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const acquired = await editing.acquirePageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
        request.body,
      );
      return acquired.ok
        ? acquired.value
        : pageRefused(request, reply, acquired.error);
    },
  });
  editor.route({
    method: "PUT",
    url: "/pages/:id/lock",
    schema: SCHEMAS.renewPageEditLock,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const renewed = await editing.renewPageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
        request.body,
      );
      return renewed.ok
        ? renewed.value
        : pageRefused(request, reply, renewed.error);
    },
  });
  editor.route({
    method: "DELETE",
    url: "/pages/:id/lock",
    schema: SCHEMAS.releasePageEditLock,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const released = await editing.releasePageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
      );
      return released.ok
        ? released.value
        : pageRefused(request, reply, released.error);
    },
  });
};
