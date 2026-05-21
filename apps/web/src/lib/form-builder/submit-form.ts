import { ClientFormStep, FormValues } from "@web/types";
import { getFullFieldId } from "./field-mapper";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface SubmitFormParams {
  formId: string;
  formVersion: string;
  values: FormValues;
  steps: ClientFormStep[];
}

export interface SubmitFormResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Submits a completed form to the API.
 *
 * Restructures the flat form values (keyed by `stepId-fieldId`) into the
 * step-scoped format the API expects: `{ stepId: { fieldId: value } }`.
 */
export async function submitForm({
  formId,
  formVersion,
  values,
  steps,
}: SubmitFormParams): Promise<SubmitFormResult> {
  const stepScopedValues = buildStepScopedValues(values, steps);

  const idempotencyKey = crypto.randomUUID();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        formId,
        formVersion,
        values: stepScopedValues,
      }),
    });
  } catch {
    return {
      success: false,
      error: "Unable to reach the server. Please check your connection and try again.",
    };
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.message ?? `Submission failed (HTTP ${response.status})`;
    return { success: false, error: message };
  }

  const body = await response.json();
  return { success: true, data: body.data };
}

/**
 * Converts flat form values (`{ "stepId-fieldId": value }`) into the
 * step-scoped structure the API expects (`{ stepId: { fieldId: value } }`).
 */
function buildStepScopedValues(
  flatValues: FormValues,
  steps: ClientFormStep[],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const step of steps) {
    const stepValues: Record<string, unknown> = {};

    for (const field of step.fields) {
      const fullId = getFullFieldId(step.stepId, field.fieldId);
      if (fullId in flatValues) {
        stepValues[field.fieldId] = flatValues[fullId];
      }
    }

    if (Object.keys(stepValues).length > 0) {
      result[step.stepId] = stepValues;
    }
  }

  return result;
}
