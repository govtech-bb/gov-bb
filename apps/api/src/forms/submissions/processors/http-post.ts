import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { sanitizeForLog } from "@/common/log-sanitize";

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
    /**
     * A truncated, control-char-sanitized slice of the endpoint's **response**
     * body (via `sanitizeForLog`: ≤200 chars, CWE-117 stripped), so a non-2xx
     * failure logs *why* — e.g. a 422's validation message — instead of the
     * bare status (#2127). Undefined when the body is empty. Never the request
     * body (that carries applicant PII and is excluded from logs).
     */
    readonly responseBody?: string,
  ) {
    super(
      `Endpoint ${url} responded with HTTP ${status}` +
        (responseBody ? `: ${responseBody}` : ""),
    );
    this.name = "HttpPostError";
  }
}

/**
 * Summarizes an endpoint's response body for a failure log: stringifies it,
 * drops empty / `{}` / `[]` bodies (nothing to add), and runs the rest through
 * `sanitizeForLog` (strips injection chars, caps at 200 chars). Response body
 * only — the endpoint's own error, not our request.
 */
function summarizeResponseBody(data: unknown): string | undefined {
  if (data === null || data === undefined) return undefined;
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else {
    try {
      text = JSON.stringify(data);
    } catch {
      return undefined;
    }
  }
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "{}" || trimmed === "[]") return undefined;
  const cleaned = sanitizeForLog(trimmed);
  return cleaned.length > 0 ? cleaned : undefined;
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
    throw new HttpPostError(url, resp.status, summarizeResponseBody(resp.data));
  }
}
