import { createIsomorphicFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env";

export const ADMIN_TOKEN_HEADER = "x-admin-token";

// `timingSafeEqual` is server-only. Wrapping it in `createIsomorphicFn` lets
// the TanStack Start bundler strip the `node:crypto` import from the client
// build — server modules in this file end up in client chunks via the
// `createServerFn(...).middleware([requireAdminToken])` chain on routes that
// import server functions (e.g. `/builder/ui`'s loader pulls in `forms.ts`,
// which references this middleware), so any top-level `node:crypto` use
// otherwise crashes the route chunk on load.
const constantTimeEqual = createIsomorphicFn()
  .server((a: Buffer, b: Buffer): boolean => timingSafeEqual(a, b))
  .client((_a: Buffer, _b: Buffer): boolean => false);

/**
 * Pure auth check, separated from the TanStack Start middleware shell
 * so it can be unit-tested. Throws on mismatch.
 *
 * Three branches:
 * - `expected = undefined` + `isProd = false` → dev passthrough.
 * - `expected = undefined` + `isProd = true`  → throws (server misconfigured).
 *                                              Defense in depth on top of env.ts's
 *                                              boot-time Zod check.
 * - `expected = string`                       → header must be present and
 *                                              timing-safe-equal.
 */
export function checkAdminToken(
  expected: string | undefined,
  request: Request,
  isProd: boolean,
): void {
  if (!expected) {
    if (isProd) {
      throw new Error(
        "Server misconfigured: ADMIN_API_TOKEN required in production",
      );
    }
    return; // dev passthrough
  }

  const presented = request.headers.get(ADMIN_TOKEN_HEADER);
  if (!presented) {
    throw new Error("Missing X-Admin-Token header");
  }

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !constantTimeEqual(a, b)) {
    throw new Error("Invalid admin token");
  }
}

export const requireAdminToken = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    checkAdminToken(
      env.ADMIN_API_TOKEN,
      getRequest(),
      process.env.NODE_ENV === "production",
    );
    return next();
  },
);
