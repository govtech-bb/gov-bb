import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

/**
 * Idempotency key shared by the outbound webhook/opencrvs processors. The
 * `:index` suffix keys each processor entry on a submission independently so a
 * per-entry retry never collides with its siblings.
 */
export function idempotencyKey(submissionId: string, index: number): string {
  return `${submissionId}:${index}`;
}

/** Thrown by {@link timedPost} when an endpoint answers with a non-2xx status. */
export class HttpPostError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`Endpoint ${url} responded with HTTP ${status}`);
    this.name = "HttpPostError";
  }
}

/**
 * Timed request over `@nestjs/axios` `HttpService` — the shared outbound-HTTP
 * primitive for the submission processors and the youth-opportunity webhook, and
 * the precondition for a future unified retry/circuit-breaker. Defaults to POST;
 * callers may override the method (the generic webhook processor exposes a
 * configurable verb).
 *
 * `body` is sent verbatim (callers pre-serialize so an HMAC signature is
 * computed over the exact bytes sent). `validateStatus` is overridden so axios
 * resolves on any status and we map non-2xx to {@link HttpPostError} ourselves,
 * instead of axios throwing its own less-specific error first.
 */
export async function timedPost(
  http: HttpService,
  url: string,
  body: string,
  opts: { headers: Record<string, string>; timeoutMs: number; method?: string },
): Promise<void> {
  const resp = await firstValueFrom(
    http.request({
      method: opts.method ?? "POST",
      url,
      data: body,
      headers: opts.headers,
      timeout: opts.timeoutMs,
      // Don't follow redirects (#287): assertSafeUrl validates the request URL
      // once, but a 3xx to an internal host (e.g. the metadata endpoint) would
      // otherwise be followed unchecked. A webhook target shouldn't redirect, so
      // a 3xx surfaces as a non-2xx HttpPostError below.
      maxRedirects: 0,
      validateStatus: () => true,
    }),
  );
  if (resp.status < 200 || resp.status >= 300) {
    throw new HttpPostError(url, resp.status);
  }
}
