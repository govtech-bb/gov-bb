import { createMiddleware } from "@tanstack/react-start";
import { getResponseStatus } from "@tanstack/react-start/server";

/**
 * Carries the status a server function set during SSR onto the page itself.
 *
 * On a client-side navigation a server function is its own request, and
 * `setResponseStatus` sets that response's status. During SSR it runs
 * in-process instead, and Start answers the page with the router's status —
 * 500 for any failed loader — so the 503 `getPage` sets is recorded on the
 * request and then ignored. This puts it back on the page's response.
 *
 * Only a 500 is replaced, and only by a status something asked for: a 404
 * from `notFound()` or a successful page is left as it is.
 */
export const serverFnStatus = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const status = getResponseStatus();
  if (result.response.status !== 500 || status === 200) return result;
  return {
    ...result,
    // The same body stream, so Start still owns the SSR stream's cleanup.
    response: new Response(result.response.body, {
      status,
      headers: result.response.headers,
    }),
  };
});
