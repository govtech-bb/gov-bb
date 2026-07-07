/**
 * Server-side client for the NestJS forms API (apps/api), which serves
 * `/service_status`, `/service_status/audit`, and `/form-definitions`.
 *
 * Runs only in the SSR Lambda — the admin bearer token never reaches the
 * client. GET reads are public; the audit read and PUT are guarded by the api's
 * AdminTokenGuard (`Authorization: Bearer <SERVICE_STATUS_ADMIN_TOKEN>`). We
 * attach the token to every call when present; in local dev it may be empty, in
 * which case the api passes through (ADR-0061).
 */
import { getServiceStatusAdminToken } from "./secrets";

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
  body?: unknown,
): Promise<T> {
  const token = await getServiceStatusAdminToken();
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
  get: <T>(path: string) => call<T>("GET", path),
  put: <T>(path: string, body: unknown) => call<T>("PUT", path, body),
};
