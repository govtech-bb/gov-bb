import { randomUUID } from "node:crypto";
import { evaluateFormConditions } from "@govtech-bb/form-conditions";
import type { ServiceContract } from "@govtech-bb/form-types";
import { getFormDefinition } from "./form-api";
import { validateAndReshape } from "./form-values";

const FORM_API_URL = (process.env.FORM_API_URL ?? "").replace(/\/+$/, "");

export type SubmitOutcome =
  | { ok: true; referenceNumber: string }
  | { ok: false; errors: Array<{ field: string; message: string }> };

type UpstreamSuccess = {
  data?: { id?: string; reference?: string; referenceNumber?: string };
  message?: string;
  statusCode?: number;
  meta?: unknown;
};

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

export async function submitFormUpstream(
  service: string,
  fields: Record<string, string>,
  submissionId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<SubmitOutcome> {
  if (!FORM_API_URL) {
    return {
      ok: false,
      errors: [{ field: "service", message: "FORM_API_URL not set" }],
    };
  }
  const contract = await getFormDefinition(service);
  if (!contract) {
    return {
      ok: false,
      errors: [{ field: "service", message: `unknown form: ${service}` }],
    };
  }

  // Only validate fields that are active given current values. Conditional
  // fields the user was never asked about must not trigger 'required' errors.
  const activeFieldIds = computeActiveFieldIds(contract, fields);
  const validation = validateAndReshape(contract, fields, activeFieldIds);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const idempotencyKey = submissionId ?? randomUUID();
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
      signal,
    });
  } catch (err) {
    console.error("[forms-api] fetch failed:", err);
    return {
      ok: false,
      errors: [
        { field: "service", message: "submission upstream unreachable" },
      ],
    };
  }

  let payload: UpstreamSuccess & UpstreamFailure = {};
  try {
    payload = await upstream.json();
  } catch {
    // empty body on some errors — fall through with status
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
    console.warn("[forms-api] upstream error:", upstream.status, errors);
    return { ok: false, errors };
  }

  const ref =
    payload.data?.referenceNumber ??
    payload.data?.reference ??
    payload.data?.id;
  if (!ref) {
    console.warn("[forms-api] 200 but no referenceNumber in response");
    return {
      ok: false,
      errors: [
        {
          field: "service",
          message:
            "Submission accepted but no reference number was returned by the forms API. Please contact the department directly.",
        },
      ],
    };
  }
  return { ok: true, referenceNumber: ref };
}

function computeActiveFieldIds(
  contract: ServiceContract,
  flat: Record<string, string>,
): Set<string> {
  const scoped: Record<string, Record<string, unknown>> = {};
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (flat[el.fieldId] === undefined) continue;
      (scoped[step.stepId] ??= {})[el.fieldId] = flat[el.fieldId];
    }
  }
  const { activeFieldIds } = evaluateFormConditions(contract, scoped);
  const all = new Set<string>();
  for (const ids of activeFieldIds.values()) {
    for (const id of ids) all.add(id);
  }
  return all;
}
