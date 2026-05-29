import { createFileRoute } from "@tanstack/react-router";
import { checkHealth } from "#/lib/health";

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
