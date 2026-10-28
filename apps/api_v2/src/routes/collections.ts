import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Employee } from "../modules/auth";
import type { Viewer } from "../modules/page-visibility";
import type {
  CollectionEditing,
  RecordWriteFailure,
} from "../services/collection-editing";
import { IF_UPDATED_AT, SCHEMAS } from "./contracts";
import { siteNotFoundCache, siteReadCache, storageFailed } from "./responses";

/** Why a record write was refused, as its response. */
function recordRefused(
  error: RecordWriteFailure,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  switch (error._tag) {
    case "RecordRejected":
      return reply.status(400).send({
        error: "validation_failed",
        message: error.message,
        errors: [...error.errors],
      });
    case "CollectionNotFound":
    case "RecordNotFound":
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    case "RecordConflict":
      return reply
        .status(409)
        .send({ error: "conflict", message: error.message });
    case "RecordExists":
      return reply
        .status(409)
        .send({ error: "record_exists", message: error.message });
    case "ContentStoreUnavailable":
      return reply.status(500).send(storageFailed(request.log, error));
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
}

/** Collection management inherits the editor scope's employee, Origin and no-store checks. */
export const editorCollectionRoutes: FastifyPluginAsyncZod<{
  collections: CollectionEditing;
  actor: (request: FastifyRequest) => Employee;
}> = async (editor, { collections, actor }) => {
  editor.route({
    method: "GET",
    url: "/collections",
    schema: SCHEMAS.listCollections,
    handler: async (request, reply) => {
      const listed = await collections.list();
      return listed.ok
        ? { collections: listed.value }
        : reply.status(500).send(storageFailed(request.log, listed.error));
    },
  });
  editor.route({
    method: "POST",
    url: "/collections/:key/records/:recordKey",
    schema: SCHEMAS.createRecord,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const { key, recordKey } = request.params;
      const created = await collections.create(
        key,
        recordKey,
        request.body.data,
        actor(request),
      );
      return created.ok
        ? reply.status(201).send(created.value)
        : recordRefused(created.error, request, reply);
    },
  });
  editor.route({
    method: "PUT",
    url: "/collections/:key/records/:recordKey",
    schema: SCHEMAS.saveRecord,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const { key, recordKey } = request.params;
      const saved = await collections.save(
        key,
        recordKey,
        request.body.data,
        request.headers[IF_UPDATED_AT] ?? null,
        actor(request),
      );
      return saved.ok
        ? saved.value
        : recordRefused(saved.error, request, reply);
    },
  });
  editor.route({
    method: "DELETE",
    url: "/collections/:key/records/:recordKey",
    schema: SCHEMAS.deleteRecord,
    config: { role: "editor" },
    handler: async (request, reply) => {
      const { key, recordKey } = request.params;
      const deleted = await collections.delete(
        key,
        recordKey,
        request.headers[IF_UPDATED_AT] ?? null,
        actor(request),
      );
      return deleted.ok
        ? reply.status(204).send()
        : recordRefused(deleted.error, request, reply);
    },
  });
};

/** The public read of a collection, inheriting the site scope's preview admission and ETag handling. */
export const publicCollectionRoutes: FastifyPluginAsyncZod<{
  collections: CollectionEditing;
  viewerFor: (request: FastifyRequest) => Viewer;
}> = async (site, { collections, viewerFor }) => {
  site.route({
    method: "GET",
    url: "/collections/:key/records",
    schema: SCHEMAS.getCollectionRecords,
    handler: async (request, reply) => {
      const viewer = viewerFor(request);
      const { key } = request.params;
      const read = await collections.read(key);
      if (!read.ok)
        return reply.status(500).send(storageFailed(request.log, read.error));
      if (read.value === null)
        return reply
          .header("Cache-Control", siteNotFoundCache(viewer))
          .status(404)
          .send({ error: "not_found", message: `No collection ${key}.` });
      reply.header("Cache-Control", siteReadCache(viewer));
      return read.value;
    },
  });
};
