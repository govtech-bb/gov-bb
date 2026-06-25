/**
 * Server-side client for the form_builder_api ECS service.
 *
 * Frontend SSR runs in Amplify's compute environment (no VPC peering) so it
 * cannot reach the private RDS directly. All data access goes through the
 * public ALB at BUILDER_API_URL, authenticated with the shared admin token.
 * This file is the only place that talks to the API.
 */

import { getAdminApiToken } from "./secrets";

const BASE_URL = process.env.BUILDER_API_URL;

// Bound every backend call with a client-side timeout. Without one, a slow
// synchronous handler (notably the AI Edit Form path — a single Bedrock
// ConverseCommand that can run long for large recipes) lets the request hang
// until the Amplify/CloudFront gateway returns a 504 origin-response timeout.
// TanStack Start's server-fn client then gets a CloudFront HTML error page
// instead of its JSON envelope and throws the opaque Error("Invariant failed").
// Firing our own abort *just under* the gateway timeout means we fail fast with
// a true, typed error the UI can map to a clear message.
//
// 25s default: sits below the Amplify WEB_COMPUTE request timeout, verified at
// ~28s in CloudWatch (the SSR Lambda is killed at 28.00s with "Request timed
// out - your application took too long to respond", surfaced to the browser as
// a 504). That ceiling is a managed-platform limit and not configurable, so 25s
// leaves ~3s for the server fn to catch the abort and flush a clean error
// before Amplify kills it. Override per-environment with BUILDER_API_TIMEOUT_MS.
// A 25s ceiling is safe for the fast auth/forms/registry calls that also use
// call() — they complete in well under a second.
const DEFAULT_TIMEOUT_MS = 25_000;

function getTimeoutMs(): number {
  const raw = process.env.BUILDER_API_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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

// Status 0 marks a transport-level failure that never reached the backend (a
// timeout/abort, or the fetch itself rejecting). Distinct from a real HTTP
// status so callers/UI can tell "the gateway timed us out" from "the API said
// no".
class ApiTimeoutError extends ApiError {
  constructor(
    message = "The AI request timed out. Try a smaller form or a simpler edit.",
  ) {
    super(0, message);
    this.name = "ApiTimeoutError";
  }
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!BASE_URL) throw new Error("BUILDER_API_URL is not set");
  // ADMIN_API_TOKEN is fetched at request time from Secrets Manager via the
  // SSR compute role (#202/#203). `getAdminApiToken` falls back to
  // process.env.ADMIN_API_TOKEN for local dev / .env.local. Cached per warm
  // Lambda after first call.
  const adminToken = await getAdminApiToken();

  const headers: Record<string, string> = {
    "X-Admin-Token": adminToken,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // AbortSignal.timeout aborts the fetch with a DOMException once the
      // deadline passes; we translate that into a clear ApiTimeoutError below.
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch (err) {
    // AbortSignal.timeout surfaces as a "TimeoutError" DOMException; a manual
    // abort would be "AbortError". Either way the request didn't complete in
    // time — map it to a clear, typed error instead of leaking the raw
    // DOMException ("The operation was aborted.") to the UI.
    if (
      err instanceof DOMException &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new ApiTimeoutError();
    }
    throw err;
  }

  if (!res.ok) {
    let message = `${method} ${path} failed: ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) message = errBody.error;
    } catch {
      // Non-JSON error body; keep the status message.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T>(path: string, body?: unknown) => call<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => call<T>("PUT", path, body),
  del: <T>(path: string, body?: unknown) => call<T>("DELETE", path, body),
};
