import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import {
  ApiResponse,
  FormDefinitionResponse,
  FormDraft,
  FormDraftResponseBody,
  formDraftResponseBodySchema,
  FormMeta,
  FormValues,
  FormDraftResponse,
} from "@web/types";

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

const makeFetch = async <T extends ApiResponse>(
  endpoint: string,
  errorMessage: string,
): Promise<{
  body: T;
  response: Response;
}> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`);
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? errorMessage
        : `Failed to load form (HTTP ${response.status}).`;
    throw new FormFetchError(message, response.status);
  }

  const body = (await response.json()) as T;
  if (body.status !== "success") {
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
    `The form "${contractId}" could not be found.`,
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

export const createFormDraft = async (
  { formId, version }: FormMeta,
  draftId: string,
  values: FormValues,
  lastActiveStep: string,
) => {
  let response: Response;

  const formDraft: FormDraft = {
    draftId,
    formId,
    version,
    values,
    lastActiveStep,
  };

  try {
    response = await fetch(`${API_URL}/form-drafts`, {
      method: "POST",
      headers: {},
      body: JSON.stringify(formDraft),
    });
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }
};

export const fetchFormDraft = async (
  draftId: string,
): Promise<FormDraftResponseBody> => {
  const { body } = await makeFetch<FormDraftResponse>(
    `/form-drafts/${draftId}`,
    "Draft not found",
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
  const url = `${API_URL}/form-drafts/${draftId}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {},
      body: JSON.stringify(toUpdate),
    });
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? "Form draft not found"
        : `Failed to load form (HTTP ${response.status}).`;
    throw new FormFetchError(message, response.status);
  }

  const body = (await response.json()) as FormDraftResponse;
  if (body.status !== "success") {
    throw new FormFetchError(
      body.message ?? "The server returned an unexpected response.",
      500,
    );
  }
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

export const deleteFormDraft = async (draftId: string): Promise<number> => {
  const url = `${API_URL}/form-drafts/${draftId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {},
    });
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? "Form draft not found"
        : `Failed to load form (HTTP ${response.status}).`;
    throw new FormFetchError(message, response.status);
  }

  return response.status;
};
