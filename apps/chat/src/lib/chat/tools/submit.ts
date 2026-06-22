import { randomUUID } from "node:crypto";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import {
  assembleStepKeyedValues,
  type ServiceContract,
  type StepFieldEntry,
  type SubmissionValues,
} from "@govtech-bb/form-types";
import { getServerEnv } from "#/config/env";
import { getFormDefinition } from "#/lib/forms/defs";
import { findField } from "#/lib/forms/fields";
import { validateValue } from "#/lib/forms/validate";
import { coerceValue } from "#/lib/forms/coerce";
import { activeFieldIds, optionalFieldIds } from "#/lib/forms/conditions";
import { applyAutoConfirmedValues } from "#/lib/forms/auto-confirm";

// Submit a collected form. The model passes the answers it gathered (flat
// fieldId→value); the server re-validates EVERY value (the model never decides
// validity), reshapes flat→valuesByStep (the forms API's shape), and POSTs —
// UNLESS dry-run, which validates + shapes but skips the write. Dry-run is the
// default (SUBMIT_LIVE gates the real POST), so local/dev never writes to the
// sandbox. Submission is also gated by tool approval — the user confirms on the
// Check-your-answers card before this runs. submit_status events drive the
// client's progress indicator.

export interface SubmitError {
  field: string;
  message: string;
}
export interface SubmitResult {
  ok: boolean;
  reference?: string;
  dryRun?: boolean;
  errors?: SubmitError[];
}

type Values = Record<string, string>;

// Group answers by their step and COERCE each to its typed value (date→parts,
// checkbox→bool, option→value) — the shape the forms API's /submissions endpoint
// expects ({ stepId: { fieldId: typedValue } }). Skips ids not in the contract;
// a value that fails coercion (it would already have failed validateAll) falls
// back to its raw string. The flat→step-keyed bucketing (+ empty/false-keep
// filtering) is the shared core the browser form also builds POST /submissions
// with, so both channels produce an identical payload (#1398).
export function reshapeByStep(
  contract: ServiceContract,
  values: Values,
): SubmissionValues {
  const entries: StepFieldEntry[] = [];
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (Object.prototype.hasOwnProperty.call(values, el.fieldId)) {
        const raw = values[el.fieldId];
        const c = coerceValue(el, raw);
        entries.push({
          stepId: step.stepId,
          fieldId: el.fieldId,
          value: "error" in c ? raw : c.value,
        });
      }
    }
  }
  return assembleStepKeyedValues(entries);
}

// Re-validate every collected value against the contract (single-field rules;
// cross-field/conditional deferred). Unknown ids and rule failures collect as
// errors.
export function validateAll(
  contract: ServiceContract,
  values: Values,
): SubmitError[] {
  const errors: SubmitError[] = [];
  for (const [fieldId, value] of Object.entries(values)) {
    const field = findField(contract, fieldId);
    if (!field) {
      errors.push({ field: fieldId, message: `unknown field: ${fieldId}` });
      continue;
    }
    const { ok, errors: errs } = validateValue(field, value);
    for (const m of errs) errors.push({ field: fieldId, message: m });
    void ok;
  }
  return errors;
}

// Completeness gate: every required field that's currently ACTIVE (conditions
// met) and NOT relaxed by an optionalIf must be present. Without this the chat
// could submit an incomplete form (the model is told to collect all required,
// but code enforces it). Respects conditional reveal + optionalIf so we don't
// demand fields the form itself doesn't currently require.
export function missingRequired(
  contract: ServiceContract,
  values: Values,
): SubmitError[] {
  const active = activeFieldIds(contract, values);
  const relaxed = optionalFieldIds(contract, values);
  const errors: SubmitError[] = [];
  for (const step of contract.steps) {
    for (const el of step.elements) {
      if (el.isHidden || el.htmlType === "file") continue;
      if (!active.has(el.fieldId) || relaxed.has(el.fieldId)) continue;
      if (!el.validations?.required) continue;
      const v = values[el.fieldId];
      if (v === undefined || v.trim() === "") {
        errors.push({ field: el.fieldId, message: `${el.label} is required` });
      }
    }
  }
  return errors;
}

export interface SubmitDeps {
  getDef?: typeof getFormDefinition;
  fetchImpl?: typeof fetch;
  live?: boolean;
  formApiUrl?: string;
  signal?: AbortSignal;
}

export async function applySubmit(
  formId: string,
  values: Values,
  deps: SubmitDeps = {},
): Promise<SubmitResult> {
  const getDef = deps.getDef ?? getFormDefinition;
  const contract = await getDef(formId);
  if (!contract) {
    return {
      ok: false,
      errors: [{ field: "service", message: "form is unavailable" }],
    };
  }

  // Seed auto-confirmed fields (the feedback declaration) on a COPY — the forms
  // API still requires it, but it never entered the values the model collected,
  // so it stays out of the approval card. Done before validation/completeness so
  // the required declaration counts as present.
  const merged = { ...values };
  applyAutoConfirmedValues(contract, merged);

  const errors = [
    ...missingRequired(contract, merged),
    ...validateAll(contract, merged),
  ];
  if (errors.length) return { ok: false, errors };

  const byStep = reshapeByStep(contract, merged);

  // Default path: validate + shape but DON'T write.
  if (!deps.live) return { ok: true, dryRun: true };

  const base = deps.formApiUrl ?? getServerEnv().FORM_API_URL;
  if (!base) {
    return {
      ok: false,
      errors: [{ field: "service", message: "forms API not configured" }],
    };
  }

  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${base}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({
        formId,
        formVersion: contract.version,
        values: byStep,
      }),
      signal: deps.signal,
    });
  } catch {
    return {
      ok: false,
      errors: [
        { field: "service", message: "submission upstream unreachable" },
      ],
    };
  }

  const payload = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; reference?: string; referenceNumber?: string };
    message?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      errors: [
        { field: "service", message: payload.message ?? `HTTP ${res.status}` },
      ],
    };
  }
  const reference =
    payload.data?.referenceNumber ??
    payload.data?.reference ??
    payload.data?.id;
  if (!reference) {
    return {
      ok: false,
      errors: [
        { field: "service", message: "submitted but no reference returned" },
      ],
    };
  }
  return { ok: true, reference };
}

export const submitFormToolDef = toolDefinition({
  name: "submitForm",
  description:
    "Submit a collected form. Call this once you've collected every required field — the user gets a Check-your-answers card with a Submit/Approve prompt, so do NOT summarise the answers in your text or ask them to confirm first. Pass the formId and a values object mapping each fieldId to the user's answer. Returns ok:true with a reference on success; ok:false with errors if a value is invalid (fix it and call submitForm again). If dryRun:true, this was a test — tell the user it was NOT actually submitted.",
  inputSchema: z.object({
    formId: z.string(),
    values: z.record(z.string(), z.string()),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    reference: z.string().optional(),
    dryRun: z.boolean().optional(),
    errors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
  needsApproval: true,
});

export const submitFormTool = submitFormToolDef.server(
  async ({ formId, values }, ctx) => {
    ctx?.emitCustomEvent?.("submit_status", { state: "submitting" });
    const result = await applySubmit(formId, values, {
      live: getServerEnv().SUBMIT_LIVE,
    });
    ctx?.emitCustomEvent?.("submit_status", {
      state: result.ok ? "submitted" : "failed",
    });
    return result;
  },
);
