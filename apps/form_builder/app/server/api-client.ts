/**
 * Server-side client for the form_builder_api ECS service.
 *
 * Frontend SSR runs in Amplify's compute environment (no VPC peering) so it
 * cannot reach the private RDS directly. All data access goes through the
 * public ALB at BUILDER_API_URL, authenticated with the shared admin token.
 * This file is the only place that talks to the API.
 */

const BASE_URL = process.env.BUILDER_API_URL;
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!BASE_URL) throw new Error("BUILDER_API_URL is not set");
  if (!ADMIN_TOKEN) throw new Error("ADMIN_API_TOKEN is not set");

  const headers: Record<string, string> = {
    "X-Admin-Token": ADMIN_TOKEN,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
