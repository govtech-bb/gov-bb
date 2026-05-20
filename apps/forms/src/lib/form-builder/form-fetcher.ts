// Responsible for fetching a form contract from the API.

import { ClientServiceContract } from "@forms/types";
import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { mapContractToLocale } from "./field-mapper";
import exampleServiceContract from "../../../contracts/example-service-contract.json";
import masterContract from "../../../contracts/master-contract.json";
import { fetchFormDefinition } from "@forms/form-api";

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

  const contract = await fetchFormDefinition(id);

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
