import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Employee } from "../modules/auth";
import type { RoleRecords } from "../services/editor-access";
import { SCHEMAS } from "./contracts";
import { storageFailed } from "./responses";

/**
 * Role management: admins only. It inherits the editor scope's employee,
 * Origin and no-store checks, and its own hook refuses everyone else before
 * any route here runs.
 */
export const editorRoleRoutes: FastifyPluginAsyncZod<{
  roles: RoleRecords;
  actor: (request: FastifyRequest) => Employee;
}> = async (admin, { roles, actor }) => {
  admin.addHook("onRequest", async (request, reply) => {
    if (!actor(request).roles.includes("admin"))
      return reply.status(403).send({
        error: "forbidden",
        message: "Only admins can see or change who has which role.",
      });
  });

  admin.route({
    method: "GET",
    url: "/editor/employees",
    schema: SCHEMAS.listEmployees,
    handler: async (request, reply) => {
      const listed = await roles.employees();
      return listed.ok
        ? { employees: listed.value }
        : reply.status(500).send(storageFailed(request.log, listed.error));
    },
  });
  admin.route({
    method: "PUT",
    url: "/editor/employees/:id/roles/:role",
    schema: SCHEMAS.grantRole,
    config: { role: "admin" },
    handler: async (request, reply) => {
      const { id, role } = request.params;
      const granted = await roles.grant(id, role, actor(request).id);
      if (granted.ok) return reply.status(204).send();
      switch (granted.error._tag) {
        case "UserNotFound":
          return reply
            .status(404)
            .send({ error: "not_found", message: granted.error.message });
        case "ContentStoreUnavailable":
          return reply
            .status(500)
            .send(storageFailed(request.log, granted.error));
        default: {
          const unexpected: never = granted.error;
          throw unexpected;
        }
      }
    },
  });
  admin.route({
    method: "DELETE",
    url: "/editor/employees/:id/roles/:role",
    schema: SCHEMAS.revokeRole,
    config: { role: "admin" },
    handler: async (request, reply) => {
      const { id, role } = request.params;
      const revoked = await roles.revoke(id, role);
      return revoked.ok
        ? reply.status(204).send()
        : reply.status(500).send(storageFailed(request.log, revoked.error));
    },
  });
};
