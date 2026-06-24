import { createFileRoute } from "@tanstack/react-router";
import { checkHealth } from "#/lib/health";

// Full health report (DB status, corpus counts, last-ingest). 503 when not ok,
// so a deploy gate / load balancer can act on the status line.
async function handleGet(): Promise<Response> {
  const report = await checkHealth();
  return new Response(JSON.stringify(report), {
    status: report.ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => handleGet(),
    },
  },
});
