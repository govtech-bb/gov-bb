import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { ApiResponse, FormDefinitionResponse } from "@web/types";

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

export const getContract = async (
  contractId: string,
): Promise<ServiceContract> => {
  let response: Response;
  try {
    response = await fetch(
      `${API_URL}/form-definitions/${encodeURIComponent(contractId)}`,
    );
  } catch {
    throw new FormFetchError(
      "Unable to reach the server. Please check your connection and try again.",
      0,
    );
  }

  if (!response.ok) {
    const message =
      response.status === 404
        ? `The form "${contractId}" could not be found.`
        : `Failed to load form (HTTP ${response.status}).`;
    throw new FormFetchError(message, response.status);
  }

  const body = (await response.json()) as FormDefinitionResponse;

  if (body.status !== "success") {
    throw new FormFetchError(
      body.message ?? "The server returned an unexpected response.",
      500,
    );
  }

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
