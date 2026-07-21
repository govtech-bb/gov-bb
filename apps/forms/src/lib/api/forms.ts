import {
  assembleStepKeyedValues,
  isSubmittableValue,
  ServiceContract,
  serviceContractSchema,
  type StepFieldEntry,
} from "@govtech-bb/form-types";
import { stepFieldIdConcactenator } from "../form-builder/field-mapper";
import {
  ApiResponse,
  FormDefinitionResponse,
  FormDefinitionsListResponse,
  PublicFormSummary,
  FormDraft,
  FormDraftResponseBody,
  formDraftResponseBodySchema,
  FormMeta,
  FormValues,
  FormDraftResponse,
  FormSubmissionResponse,
  formSubmissionResponseBodySchema,
  FormValuesByStep,
  RepeatableStepSettings,
  ClientPrimitive,
} from "@forms/types";
import { requireEnv } from "../../config/env";

const API_URL = requireEnv(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
  "http://localhost:3001",
);

/**
 * Thrown when a contract fetch fails. Carries the HTTP status code so callers
 * (and error UI) can distinguish 404 "not found" from 5xx "server error".
 */
export class FormFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FormFetchError";
  }
}

interface ResponseErrorMessages {
  not_found?: string;
}

const makeFetch = async <T extends ApiResponse>(
  endpoint: string,
  errorMessage: ResponseErrorMessages,
  fetchArgs: {
    method: "POST" | "GET" | "DELETE" | "PATCH";
    headers?: HeadersInit;
    body?: string; // JSON.stringify it before passing it.
  } = { method: "GET" },
): Promise<{
  body: T;
  response: Response;
}> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchArgs,
      // Attach the cross-app shared `preview` cookie and store any the API mints
      // (#1646 Phase 3). The API CORS allows credentials; harmless on the normal
      // citizen flow where no such cookie exists.
      credentials: "include",
    });
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    let message: string;

    switch (response.status) {
      case 404:
        message = errorMessage.not_found ?? "Requested item was not found";
        break;
      default:
        message = `Failed to load form (HTTP ${response.status}).`;
    }
    throw new FormFetchError(message, response.status);
  }

  const body = (await response.json()) as T;
  if (body.status && body.status !== "success") {
    throw new FormFetchError(
      body.message ?? "The server returned an unexpected response.",
      500,
    );
  }

  return { body, response };
};

export const fetchFormDefinition = async (
  contractId: string,
  preview?: string,
  draft?: string,
): Promise<ServiceContract> => {
  // `?preview=` → X-Recipe-Preview (visibility bypass, published recipe);
  // `?draft=` → X-Recipe-Draft (DB scratch). Both validate server-side against
  // RECIPE_PREVIEW_TOKEN (#1682).
  const headers: Record<string, string> = {};
  if (preview) headers["X-Recipe-Preview"] = preview;
  if (draft) headers["X-Recipe-Draft"] = draft;

  const { body } = await makeFetch<FormDefinitionResponse>(
    `/form-definitions/${encodeURIComponent(contractId)}`,
    { not_found: `The form "${contractId}" could not be found.` },
    Object.keys(headers).length > 0 ? { method: "GET", headers } : undefined,
  );

  try {
    const contract: ServiceContract = serviceContractSchema.parse(body.data);
    return contract;
  } catch {
    throw new FormFetchError(
      "The form fetched is of an incorrect format and can not be parsed.",
      400,
    );
  }
};

export const fetchFormDefinitions = async (): Promise<PublicFormSummary[]> => {
  const { body } = await makeFetch<FormDefinitionsListResponse>(
    `/form-definitions`,
    { not_found: "Form definitions could not be found." },
  );
  return body.data;
};

export const createFormDraft = async (
  { formId }: FormMeta,
  draftId: string,
  values: FormValues,
  lastActiveStep: string,
) => {
  const endpoint = "/form-drafts";
  const formDraft: FormDraft = {
    draftId,
    formId,
    values,
    lastActiveStep,
  };

  // Await so a save failure rejects this promise (throws FormFetchError)
  // instead of being silently lost as an unhandled rejection — callers can
  // surface it. NOTE: currently unused; wired here for correctness on adoption.
  await makeFetch(
    endpoint,
    {},
    {
      body: JSON.stringify(formDraft),
      method: "POST",
    },
  );
};

export const fetchFormDraft = async (
  draftId: string,
): Promise<FormDraftResponseBody> => {
  const { body } = await makeFetch<FormDraftResponse>(
    `/form-drafts/${draftId}`,
    { not_found: "Draft not found" },
  );

  try {
    const draft: FormDraftResponseBody = formDraftResponseBodySchema.parse(
      body.data,
    );
    return draft;
  } catch {
    throw new FormFetchError(
      "The form fetched is of an incorrect format and can not be parsed.",
      400,
    );
  }
};

export const patchFormDraft = async (
  draftId: string,
  toUpdate: Partial<FormDraft>,
): Promise<FormDraftResponseBody> => {
  const endpoint = `/form-drafts/${draftId}`;

  const fetchArgs = {
    method: "PATCH",
    headers: {},
    body: JSON.stringify(toUpdate),
  } as const;

  const errorMessage: ResponseErrorMessages = {
    not_found: "Form draft not found",
  };

  const { body } = await makeFetch<FormDraftResponse>(
    endpoint,
    errorMessage,
    fetchArgs,
  );

  try {
    const draft: FormDraftResponseBody = formDraftResponseBodySchema.parse(
      body.data,
    );
    return draft;
  } catch {
    throw new FormFetchError(
      "The draft fetched is of an incorrect format and can not be parsed.",
      400,
    );
  }
};

export const deleteFormDraft = async (draftId: string): Promise<number> => {
  const endpoint = `/form-drafts/${draftId}`;
  const errorMessage = {};
  const fetchArgs = { method: "DELETE" } as const;

  const { response } = await makeFetch(endpoint, errorMessage, fetchArgs);

  return response.status;
};

export const postFormSubmission = async (
  { formId, idempotencyKey }: FormMeta,
  valuesBySteps: FormValuesByStep,
  // `?preview=` token: forwarded as X-Recipe-Preview so a reviewer can submit a
  // published-but-flagged (non-public) form — the visibility gate is bypassed
  // server-side (#1682). Absent on the normal citizen flow.
  previewToken?: string,
) => {
  const endpoint = `/submissions`;
  const errorMessage = {};
  const fetchArgs = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "idempotency-key": idempotencyKey,
      ...(previewToken ? { "X-Recipe-Preview": previewToken } : {}),
    },
    body: JSON.stringify({
      formId,
      values: valuesBySteps,
    }),
  } as const;

  //TODO: Do special things based on response status
  const { body } = await makeFetch<FormSubmissionResponse>(
    endpoint,
    errorMessage,
    fetchArgs,
  );

  try {
    formSubmissionResponseBodySchema.parse(body.data);
    return body;
  } catch {
    throw new FormFetchError(
      "The data returned is of an incorrect format and can not be parsed.",
      400,
    );
  }
};

export const formatDataForSubmission = (
  values: FormValues,
  repeatableSettings: RepeatableStepSettings,
  hiddenFields: ClientPrimitive[],
): FormValuesByStep => {
  //  The values of any fields that are conditionally invisible, should be removed
  for (const field of hiddenFields) delete values[field.id];

  // Any field values that are undefined or empty, should be stripped out.
  // `isSubmittableValue` keeps an explicit `false` (an unchecked optional
  // checkbox is a real answer) while dropping empties — the same policy the
  // shared reshaper applies (#1398).
  values = Object.fromEntries(
    Object.entries(values).filter(([, value]) => isSubmittableValue(value)),
  );

  // The values for repeatable steps should be collapsed under the step id of the source step, becoming an array.

  const collapsedRepeatables: FormValuesByStep = {};
  const toDelete: string[] = [];

  for (const stepId of Object.keys(repeatableSettings)) {
    const currentRepeatSettings = repeatableSettings[stepId];
    collapsedRepeatables[stepId] = [];

    const sharedData = currentRepeatSettings.sharedData;
    // sharedData is populated (one key per shared fieldId) exactly when the
    // step has a sharedFields behaviour. In that case the base step is a
    // separate "shared values" page, NOT an instance — see setupRepeatSteps.
    const hasSharedFields = Object.keys(sharedData ?? {}).length > 0;

    for (const orderedStepId of currentRepeatSettings.orderedStepIds) {
      // Don't fold the base step as an instance for a shared-fields step: its
      // only fields are the shared ones (folded into each ~N instance via
      // `sharedData` below). Including it would emit an incomplete instance
      // missing the per-instance required fields → POST /submissions 422 (#1257).
      if (hasSharedFields && orderedStepId === stepId) continue;

      if (orderedStepId !== stepId) {
        const hasVisibleValues = Object.keys(values).filter((stepFieldID) =>
          stepFieldID.startsWith(orderedStepId),
        );
        // If this step isn't valid, then the subsequent ones aren't either
        if (hasVisibleValues.length === 0) break;
      }

      // If it's valid, then we just grab their data.
      // Fall back to extracting from flat form values if stepData wasn't populated
      // (e.g. useEffect race condition on fast navigation).
      const data = currentRepeatSettings.stepData[orderedStepId];

      const currentRepeatable: FormValues = {};

      if (data && Object.keys(data).length > 0) {
        for (const [stepFieldId, value] of Object.entries(data)) {
          const fieldId = stepFieldId.split(stepFieldIdConcactenator)[1];
          currentRepeatable[fieldId] = value;
        }
      } else {
        // Derive from flat values as fallback
        for (const [key, value] of Object.entries(values)) {
          if (key.startsWith(`${orderedStepId}${stepFieldIdConcactenator}`)) {
            const fieldId = key.split(stepFieldIdConcactenator)[1];
            currentRepeatable[fieldId] = value;
          }
        }
      }

      // Similarly, the values for shared fields shall be put in each array instance.
      collapsedRepeatables[stepId].push({
        ...currentRepeatable,
        ...sharedData,
      });
    }
    toDelete.push(...currentRepeatSettings.orderedStepIds.slice(1));
  }

  // Strip UI-only control fields from repeatable instances.
  // The "addAnother" radio is a navigation control injected by the renderer —
  // it is not form data and the backend rejects it as an unknown field.
  for (const stepId of Object.keys(collapsedRepeatables)) {
    const instances = collapsedRepeatables[stepId] as Record<string, unknown>[];
    for (const instance of instances) {
      delete instance.addAnother;
    }
  }

  // The structure of values should be changed from Record <stepAndFieldID, fieldValue> to Record<stepId, Record<fieldId, fieldValue>>,
  // where stepAndFieldID is the identifier of the form stepId_fieldId.
  // The flat→step-keyed bucketing (+ empty/false-keep filtering) is the shared
  // core both this form and the chat assistant build POST /submissions with
  // (#1398); repeatable instances are handled above and merged in below.
  const entries: StepFieldEntry[] = [];
  for (const [stepFieldId, value] of Object.entries(values)) {
    const [stepId, fieldId] = stepFieldId.split(stepFieldIdConcactenator);
    if (toDelete.includes(stepId)) continue;
    entries.push({ stepId, fieldId, value });
  }

  // Apply the collapsedRepeatables
  return { ...assembleStepKeyedValues(entries), ...collapsedRepeatables };
};
