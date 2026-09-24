/**
 * Builds the OpenAPI document without a database.
 *
 * `buildApp` needs a `Database` to construct its store, but generating the
 * spec never issues a query — Fastify assembles it from the route schemas
 * alone. So the generator and the drift test share this one entry point
 * rather than each standing up a Postgres to read a document that does not
 * depend on one.
 */

import { buildApp } from "./app";
import type { Database } from "./store";

export async function buildOpenApiDocument(): Promise<Record<string, unknown>> {
  // Never dereferenced: the store holds it, and no route runs.
  const app = await buildApp({ db: undefined as unknown as Database });
  await app.ready();
  const document = app.swagger() as Record<string, unknown>;
  await app.close();
  return document;
}
