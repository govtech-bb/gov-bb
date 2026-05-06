// Responsible for fetching a form contract from the API.

import { ClientServiceContract } from "@web/types";
import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { mapContractToLocale } from "./field-mapper";
import exampleServiceContract from "../../../contracts/example-service-contract.json";
import masterContract from "../../../contracts/master-contract.json";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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

interface ApiResponseBody {
  status: "success" | "failed";
  message: string;
  data: unknown;
}

/**
 * Fetches a service contract by ID from the API, validates its shape, and
 * maps it into a ClientServiceContract ready for the form renderer.
 *
 * @throws {FormFetchError} when the API returns a non-OK response or the
 *   response body indicates failure.
 */
export const fetchContract = async (
  id: string,
): Promise<ClientServiceContract> => {
  if (id === "example" || id === "master") {
    return fetchExampleContract(id);
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/form-definitions/${encodeURIComponent(id)}`,
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
        ? `The form "${id}" could not be found.`
        : `Failed to load form (HTTP ${response.status}).`;
    throw new FormFetchError(message, response.status);
  }

  const body = (await response.json()) as ApiResponseBody;

  if (body.status !== "success") {
    throw new FormFetchError(
      body.message ?? "The server returned an unexpected response.",
      500,
    );
  }

  const contract: ServiceContract = serviceContractSchema.parse(body.data);
  return mapContractToLocale(contract);
};

const fetchExampleContract = (
  id: "master" | "example",
): ClientServiceContract => {
  let contract: ServiceContract;

  if (id === "master") {
    contract = serviceContractSchema.parse(masterContract);
  } else {
    contract = serviceContractSchema.parse(exampleServiceContract);
  }

  return mapContractToLocale(contract);
};
