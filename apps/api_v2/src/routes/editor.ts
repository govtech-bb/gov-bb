import type { FastifyReply, FastifyRequest } from "fastify";
import type { ICategoryEditing } from "../services/category-editing";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Employee } from "../modules/auth";
import { Redacted } from "../modules/redacted";
import type { EmployeeGate } from "../services/editor-access";
import type { EditorIndex } from "../services/editor-index";
import { editorCategoryRoutes } from "./categories";
import type { IPageEditing } from "../services/page-editing";
import { PAGE_EDIT_LOCK_HEADER, SCHEMAS } from "./contracts";
import {
  PageEditLockRequired,
  type PageEditLockLost,
  type PageEditLockConflict,
} from "../modules/page-edit-lock";
import type {
  PageNotFound,
  PageRejected,
  PageVersionConflict,
  ContentStoreUnavailable,
} from "../modules/page";
import { EDITOR_READ, rejected, storageFailed } from "./responses";

/** Authenticated editor operations, behind an employee session and the editor's Origin. */
export const editorRoutes: FastifyPluginAsyncZod<{
  editing: IPageEditing;
  index: EditorIndex;
  categories: ICategoryEditing;
  access: EmployeeGate;
  editorOrigin: string;
}> = async (editor, { editing, index, categories, access, editorOrigin }) => {
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
      const found = await editing.get(request.params.id);
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
    handler: async (request, reply) => {
      const created = await editing.create(request.body, actor(request));
      if (created.ok) return reply.status(201).send(created.value);
      switch (created.error._tag) {
        case "PageRejected":
          return reply.status(422).send(rejected(created.error));
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
    handler: async (request, reply) => {
      const token = request.headers[PAGE_EDIT_LOCK_HEADER];
      if (!token)
        return sendPageFailure(
          request,
          reply,
          new PageEditLockRequired(request.params.id),
        );
      const saved = await editing.save(
        request.params.id,
        request.body,
        request.body.version,
        token,
        actor(request),
      );
      return saved.ok
        ? saved.value
        : sendPageFailure(request, reply, saved.error);
    },
  });
  editor.route({
    method: "DELETE",
    url: "/pages/:id",
    schema: SCHEMAS.deletePage,
    handler: async (request, reply) => {
      const token = request.headers[PAGE_EDIT_LOCK_HEADER];
      if (!token)
        return sendPageFailure(
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
        : sendPageFailure(request, reply, deleted.error);
    },
  });
  editor.get(
    "/pages/:id/lock",
    { schema: SCHEMAS.readPageEditLock },
    async (request, reply) => {
      const status = await editing.readPageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
      );
      return status.ok
        ? status.value
        : sendPageFailure(request, reply, status.error);
    },
  );
  editor.post(
    "/pages/:id/lock",
    { schema: SCHEMAS.acquirePageEditLock },
    async (request, reply) => {
      const acquired = await editing.acquirePageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
        request.body,
      );
      return acquired.ok
        ? acquired.value
        : sendPageFailure(request, reply, acquired.error);
    },
  );
  editor.put(
    "/pages/:id/lock",
    { schema: SCHEMAS.renewPageEditLock },
    async (request, reply) => {
      const renewed = await editing.renewPageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
        request.body,
      );
      return renewed.ok
        ? renewed.value
        : sendPageFailure(request, reply, renewed.error);
    },
  );
  editor.delete(
    "/pages/:id/lock",
    { schema: SCHEMAS.releasePageEditLock },
    async (request, reply) => {
      const released = await editing.releasePageEditLock(
        request.params.id,
        actor(request),
        request.headers[PAGE_EDIT_LOCK_HEADER],
      );
      return released.ok
        ? released.value
        : sendPageFailure(request, reply, released.error);
    },
  );
};

/** Project expected failures without leaking database causes or editing credentials. */
function sendPageFailure(
  request: FastifyRequest,
  reply: FastifyReply,
  failure:
    | PageRejected
    | PageNotFound
    | PageVersionConflict
    | PageEditLockRequired
    | PageEditLockLost
    | PageEditLockConflict
    | ContentStoreUnavailable,
) {
  switch (failure._tag) {
    case "PageRejected":
      return reply.status(422).send(rejected(failure));
    case "PageNotFound":
      return reply
        .status(404)
        .send({ error: "not_found", message: failure.message });
    case "ContentStoreUnavailable":
      return reply.status(500).send(storageFailed(request.log, failure));
    case "PageVersionConflict":
      return reply.status(409).send({
        error: "page_version_conflict",
        message: failure.message,
        pageId: failure.pageId,
      });
    case "PageEditLockRequired":
      return reply.status(409).send({
        error: "page_edit_lock_required",
        message: failure.message,
        pageId: failure.pageId,
      });
    case "PageEditLockLost":
      return reply.status(409).send({
        error: "page_edit_lock_lost",
        message: failure.message,
        pageId: failure.pageId,
      });
    case "PageEditLockConflict":
      return reply.status(409).send({
        error: "page_edit_lock_conflict",
        message: failure.message,
        pageId: failure.pageId,
      });
    default: {
      const unexpected: never = failure;
      throw unexpected;
    }
  }
}
