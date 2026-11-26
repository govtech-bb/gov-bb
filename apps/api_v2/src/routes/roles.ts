import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type {
  DefaultRoleChange,
  Employee,
  OwnRoleChange,
  UserNotFound,
} from "../modules/auth";
import type { ContentStoreUnavailable } from "../modules/page";
import type { PermissionDenied } from "../modules/permissions";
import type { IPeople } from "../services/people";
import { SCHEMAS } from "./contracts";
import { storageFailed } from "./responses";

/** Why the people service refused, as its response. */
function peopleRefused(
  error:
    | PermissionDenied
    | DefaultRoleChange
    | OwnRoleChange
    | UserNotFound
    | ContentStoreUnavailable,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  switch (error._tag) {
    case "PermissionDenied":
    case "DefaultRoleChange":
    case "OwnRoleChange":
      return reply
        .status(403)
        .send({ error: "forbidden", message: error.message });
    case "UserNotFound":
      return reply
        .status(404)
        .send({ error: "not_found", message: error.message });
    case "ContentStoreUnavailable":
      return reply.status(500).send(storageFailed(request.log, error));
    default: {
      const unexpected: never = error;
      throw unexpected;
    }
  }
}

/**
 * Role management. It inherits the editor scope's employee, Origin and
 * no-store checks; the people service decides who may see and change roles.
 */
export const editorRoleRoutes: FastifyPluginAsyncZod<{
  people: IPeople;
  actor: (request: FastifyRequest) => Employee;
}> = async (admin, { people, actor }) => {
  admin.route({
    method: "GET",
    url: "/editor/employees",
    schema: SCHEMAS.listEmployees,
    handler: async (request, reply) => {
      const listed = await people.list(actor(request));
      return listed.ok
        ? { employees: listed.value }
        : peopleRefused(listed.error, request, reply);
    },
  });
  admin.route({
    method: "PUT",
    url: "/editor/employees/:id/roles/:role",
    schema: SCHEMAS.grantRole,
    handler: async (request, reply) => {
      const { id, role } = request.params;
      const granted = await people.grant(id, role, actor(request));
      return granted.ok
        ? reply.status(204).send()
        : peopleRefused(granted.error, request, reply);
    },
  });
  admin.route({
    method: "DELETE",
    url: "/editor/employees/:id/roles/:role",
    schema: SCHEMAS.revokeRole,
    handler: async (request, reply) => {
      const { id, role } = request.params;
      const revoked = await people.revoke(id, role, actor(request));
      return revoked.ok
        ? reply.status(204).send()
        : peopleRefused(revoked.error, request, reply);
    },
  });
};
