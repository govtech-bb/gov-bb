import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { stepFieldIdConcactenator } from "@web/lib";
import {
  ApiResponse,
  FormDefinitionResponse,
  FormDefinitionsListResponse,
  FormDefinitionSummary,
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
} from "@web/types";
import { valueIsEmpty } from "../form-builder/validation-methods";

const API_URL = process.env.VITE_API_URL ?? "http://localhost:3001";

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
): Promise<ServiceContract> => {
  const { body } = await makeFetch<FormDefinitionResponse>(
    `/form-definitions/${encodeURIComponent(contractId)}`,
    { not_found: `The form "${contractId}" could not be found.` },
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

export const fetchFormDefinitions = async (): Promise<
  FormDefinitionSummary[]
> => {
  const { body } = await makeFetch<FormDefinitionsListResponse>(
    `/form-definitions`,
    { not_found: "Form definitions could not be found." },
  );
  return body.data;
};

export const createFormDraft = async (
  { formId, version }: FormMeta,
  draftId: string,
  values: FormValues,
  lastActiveStep: string,
) => {
  const endpoint = "/form-drafts";
  const formDraft: FormDraft = {
    draftId,
    formId,
    version,
    values,
    lastActiveStep,
  };

  makeFetch(
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
  const endpoint = `/form-drafs/${draftId}`;
  const errorMessage = {};
  const fetchArgs = { method: "DELETE" } as const;

  const { response } = await makeFetch(endpoint, errorMessage, fetchArgs);

  return response.status;
};

export const postEzpay = async () => {};

export const postFormSubmission = async (
  { formId, version: formVersion, idempotencyKey }: FormMeta,
  valuesBySteps: FormValuesByStep,
) => {
  const endpoint = `/submissions`;
  const errorMessage = {};
  const fetchArgs = {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      formId,
      formVersion,
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
  const formValuesByStep: FormValuesByStep = {};

  //  The values of any fields that are conditionally invisible, should be removed
  for (const field of hiddenFields) delete values[field.id];

  // Any field values that are undefined or empty, should be stripped out.
  values = Object.fromEntries(
    Object.entries(values).filter(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ([_key, value]) => value !== undefined && !valueIsEmpty(value),
    ),
  );

  // The values for repeatable steps should be collapsed under the step id of the source step, becoming an array.

  const collapsedRepeatables: FormValuesByStep = {};
  const toDelete: string[] = [];

  for (const stepId of Object.keys(repeatableSettings)) {
    const currentRepeatSettings = repeatableSettings[stepId];
    collapsedRepeatables[stepId] = [currentRepeatSettings.stepData[stepId]];

    const sharedData = currentRepeatSettings.sharedData;
    console.log({ sharedData });

    for (const subStepId of currentRepeatSettings.orderedStepIds.slice(1)) {
      const hasVisibleValues = Object.keys(values).filter((stepFieldID) =>
        stepFieldID.startsWith(subStepId),
      );
      // If this step isn't valid, then the subsequent ones aren't either
      if (hasVisibleValues.length === 0) break;

      // If it's valid, then we just grab their data.
      // Similarly, the values for shared fields shall be put in each array instance.
      collapsedRepeatables[stepId].push(
        currentRepeatSettings.stepData[subStepId],
      );
    }
    toDelete.push(...currentRepeatSettings.orderedStepIds.slice(1));
  }

  // The structure of values should be changed from Record <stepAndFieldID, fieldValue> to Record<stepId, Record<fieldId, fieldValue>>,
  // where stepAndFieldID is the identifier of the form stepId_fieldId.

  for (const [stepFieldId, value] of Object.entries(values)) {
    const [stepId, fieldId] = stepFieldId.split(stepFieldIdConcactenator);
    if (toDelete.includes(stepId)) continue;

    formValuesByStep[stepId] = {
      ...(formValuesByStep[stepId] ?? {}),
      [fieldId]: value,
    };
  }

  // Apply the collapsedRepeatables

  console.log({ results: { ...formValuesByStep, ...collapsedRepeatables } });
  return { ...formValuesByStep, ...collapsedRepeatables };
};
