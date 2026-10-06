import Fastify, { type FastifySchema } from "fastify";
import swagger from "@fastify/swagger";
import { OPENAPI_DOCUMENT, ROUTES } from "./openapi";

/** Generate route documentation without constructing application dependencies. */
export async function buildOpenApiDocument() {
  const app = Fastify();
  try {
    await app.register(swagger, { openapi: OPENAPI_DOCUMENT });
    for (const route of Object.values(ROUTES)) {
      const schema: FastifySchema = route.schema;
      app.route({
        method: route.method,
        url: route.url,
        schema,
        handler: async () => null,
      });
    }
    await app.ready();
    return app.swagger();
  } finally {
    await app.close();
  }
}
