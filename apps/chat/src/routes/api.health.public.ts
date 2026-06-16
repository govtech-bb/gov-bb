import { createFileRoute } from "@tanstack/react-router";
import { checkHealth } from "#/lib/health";

// Minimal public liveness check: just `{ ok }`, CORS-open, so an external probe
// (or the landing site) can ping it without exposing corpus counts.
async function handleGet(): Promise<Response> {
  const { ok } = await checkHealth();
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

export const Route = createFileRoute("/api/health/public")({
  server: {
    handlers: {
      GET: () => handleGet(),
    },
  },
});
