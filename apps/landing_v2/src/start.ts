import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import { getResponseStatus } from '@tanstack/react-start/server'

// A thrown loader error makes the router answer 500, and h3 returns a handler
// Response untouched, so a status set with `setResponseStatus(503)` (see
// `getPage`) is otherwise lost. Re-issue the response with it.
const unavailableStatus = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const result = await next()
    return getResponseStatus() === 503
      ? new Response(result.response.body, {
          status: 503,
          headers: result.response.headers,
        })
      : result
  },
)

// Defining `requestMiddleware` replaces Start's default CSRF middleware, so
// re-add it with the same options Start's default uses.
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    unavailableStatus,
  ],
}))
