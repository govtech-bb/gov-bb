import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getFormDefinition } from "#/lib/chat/form-api";
import { validateAndReshape } from "#/lib/chat/form-values";

const FORM_API_URL = (process.env.FORM_API_URL ?? "").replace(/\/+$/, "");

const RequestSchema = z.object({
  service: z.string().min(1),
  fields: z.record(z.string(), z.string()),
});

type UpstreamSuccess = {
  data?: { id?: string; reference?: string; referenceNumber?: string };
  message?: string;
  statusCode?: number;
  meta?: unknown;
};

// Upstream errors arrive either as string[] (DTO-level) or as a nested
// { [stepId]: { [fieldId]: string[] } } map (per-field validation).
type UpstreamErrors = string[] | Record<string, Record<string, string[]>>;

type UpstreamFailure = {
  message?: string;
  statusCode?: number;
  meta?: { errors?: UpstreamErrors };
};

function flattenUpstreamErrors(
  err: UpstreamErrors | undefined,
): Array<{ field: string; message: string }> {
  if (!err) return [];
  if (Array.isArray(err)) {
    return err.map((m) => ({ field: "service", message: m }));
  }
  const out: Array<{ field: string; message: string }> = [];
  for (const stepErrors of Object.values(err)) {
    for (const [fieldId, messages] of Object.entries(stepErrors)) {
      for (const m of messages) out.push({ field: fieldId, message: m });
    }
  }
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handlePost({
  request,
}: {
  request: Request;
}): Promise<Response> {
  if (!FORM_API_URL) {
    return json(
      {
        ok: false,
        errors: [{ field: "service", message: "FORM_API_URL not set" }],
      },
      500,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(
      { ok: false, errors: [{ field: "service", message: "invalid JSON" }] },
      400,
    );
  }
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        errors: [
          {
            field: "service",
            message: parsed.error.issues[0]?.message ?? "invalid body",
          },
        ],
      },
      400,
    );
  }

  const { service, fields } = parsed.data;
  const contract = await getFormDefinition(service);
  if (!contract) {
    return json(
      {
        ok: false,
        errors: [{ field: "service", message: `unknown form: ${service}` }],
      },
      404,
    );
  }

  const validation = validateAndReshape(contract, fields);
  if (!validation.ok) {
    return json({ ok: false, errors: validation.errors }, 200);
  }

  const idempotencyKey = randomUUID();
  // Use the lookup slug (matches /form-definitions list + GET path) rather
  // than contract.formId — sandbox returns "-test"-suffixed formIds on the
  // detail endpoint that submissions don't recognise.
  const body = {
    formId: service,
    formVersion: contract.version,
    values: validation.valuesByStep,
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${FORM_API_URL}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[chat/forms-submit] fetch failed:", err);
    return json(
      {
        ok: false,
        errors: [
          { field: "service", message: "submission upstream unreachable" },
        ],
      },
      502,
    );
  }

  let payload: UpstreamSuccess & UpstreamFailure = {};
  try {
    payload = await upstream.json();
  } catch {
    // Body may be empty for some error responses; fall through with status.
  }

  if (!upstream.ok) {
    const flattened = flattenUpstreamErrors(payload.meta?.errors);
    const errors = flattened.length
      ? flattened
      : [
          {
            field: "service",
            message: payload.message ?? `HTTP ${upstream.status}`,
          },
        ];
    console.warn(
      "[chat/forms-submit] upstream error:",
      upstream.status,
      errors,
    );
    return json({ ok: false, errors }, 200);
  }

  const ref =
    payload.data?.referenceNumber ??
    payload.data?.reference ??
    payload.data?.id ??
    idempotencyKey;

  return json({ ok: true, referenceNumber: ref });
}

export const Route = createFileRoute("/api/forms-submit")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost({ request }),
    },
  },
});
