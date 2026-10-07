import type { FastifyPluginAsync } from "fastify";

/** Authentication's HTTP boundary; the concrete adapter owns its framework. */
export interface AuthHandler {
  /** Process a standards-based request and retain all response cookies. */
  handle(request: Request): Promise<Response>;
}

/** Mount the authentication protocol without exposing adapter construction. */
export const authRoutes: FastifyPluginAsync<{
  auth: AuthHandler;
  apiOrigin: string;
}> = async (app, { auth, apiOrigin }) => {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    schema: {
      summary: "GitHub sign-in and session protocol",
      description:
        "Better Auth owns the endpoints under this prefix. Responses are never cached.",
      tags: ["auth"],
    },
    onRequest: async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
    },
    handler: async (request, reply) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value))
          value.forEach((part) => headers.append(name, part));
        else if (value !== undefined) headers.set(name, value);
      }
      const response = await auth.handle(
        new Request(`${apiOrigin}${request.url}`, {
          method: request.method,
          headers,
          ...(request.body === undefined
            ? {}
            : { body: JSON.stringify(request.body) }),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") reply.header(name, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("Set-Cookie", cookies);
      reply.header("Cache-Control", "no-store");
      return reply.send(response.body ? await response.text() : null);
    },
  });
};
