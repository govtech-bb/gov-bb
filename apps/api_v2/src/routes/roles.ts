import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type {
  DefaultRoleChange,
  EmailNotAllowed,
  Employee,
  OwnRoleChange,
  UserNotFound,
  WaitingRoleNotFound,
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
    | EmailNotAllowed
    | UserNotFound
    | WaitingRoleNotFound
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
    case "EmailNotAllowed":
      return reply
        .status(400)
        .send({ error: "email_not_allowed", message: error.message });
    case "UserNotFound":
    case "WaitingRoleNotFound":
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
        ? {
            employees: listed.value.employees,
            waiting: listed.value.waiting,
          }
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
  // The email in the body, not the address: request lines are logged
  admin.route({
    method: "POST",
    url: "/editor/waiting-roles",
    schema: SCHEMAS.giveWaitingRole,
    handler: async (request, reply) => {
      const { email, role } = request.body;
      const given = await people.giveByEmail(email, role, actor(request));
      return given.ok
        ? reply.status(201).send(given.value)
        : peopleRefused(given.error, request, reply);
    },
  });
  admin.route({
    method: "DELETE",
    url: "/editor/waiting-roles/:id",
    schema: SCHEMAS.takeWaitingRole,
    handler: async (request, reply) => {
      const taken = await people.takeWaiting(request.params.id, actor(request));
      return taken.ok
        ? reply.status(204).send()
        : peopleRefused(taken.error, request, reply);
    },
  });
};
