/**
 * Server-side client for the NestJS forms API (apps/api), which serves
 * `/service_status`, `/service_status/audit`, `/services`, and
 * `/form-definitions`.
 *
 * Runs only in the SSR Lambda. Auth is by **forwarded GitHub identity**: callers
 * pass the signed-in user's GitHub access token (from the session), which the
 * API validates + authorizes (GitHubAuthGuard). Public reads
 * (`/form-definitions`, `/service_status`) need no token; the audit read, `PUT`,
 * and the non-public `/services` view do. The token is never bundled client-side
 * — it only lives in the encrypted session cookie and this server module.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

function baseUrl(): string {
  // `||` not `??`: vite's `define` bakes an unset var to "" (not undefined), and
  // an empty base would produce a relative fetch URL that fails to parse.
  const raw =
    process.env.FEATURE_FLAGGING_API_URL ||
    "https://forms.api.sandbox.alpha.gov.bb";
  return raw.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Envelope every apps/api endpoint returns. */
interface ApiEnvelope<T> {
  status: string;
  data: T;
}

async function call<T>(
  method: "GET" | "PUT",
  path: string,
  opts: { body?: unknown; token?: string } = {},
): Promise<T> {
  const { body, token } = opts;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new ApiError(0, `${method} ${path} timed out`);
    }
    throw err;
  }

  if (!res.ok) {
    let message = `${method} ${path} failed: ${res.status}`;
    try {
      const errBody = (await res.json()) as { message?: string };
      if (errBody.message) message = errBody.message;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new ApiError(res.status, message);
  }

  const json = (await res.json()) as ApiEnvelope<T>;
  return json.data;
}

export const api = {
  /** GET a path. Pass the user's GitHub token to unlock guarded/non-public data. */
  get: <T>(path: string, token?: string) => call<T>("GET", path, { token }),
  /** PUT a path with the user's GitHub token (required by the API's guard). */
  put: <T>(path: string, body: unknown, token: string) =>
    call<T>("PUT", path, { body, token }),
};
