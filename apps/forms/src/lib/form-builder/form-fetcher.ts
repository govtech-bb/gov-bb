// Responsible for fetching a form contract from the API.

import { ClientServiceContract } from "@forms/types";
import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { mapContractToLocale } from "@govtech-bb/form-renderer";
import exampleServiceContract from "../../../contracts/example-service-contract.json";
import masterContract from "../../../contracts/master-contract.json";
import { fetchFormDefinition } from "@forms/form-api";

/**
 * Fetches a service contract by ID from the API, validates its shape, and
 * maps it into a ClientServiceContract ready for the form renderer.
 *
 * Note: the synthetic `"example"` and `"master"` IDs resolve local JSON
 * fixtures and are not backed by the database, so the `preview`/`draft` tokens
 * are not applicable to them and are intentionally ignored when either ID is
 * supplied.
 *
 * @throws {FormFetchError} when the API returns a non-OK response or the
 *   response body indicates failure.
 */
export const fetchContract = async (
  id: string,
  preview?: string,
  draft?: string,
): Promise<ClientServiceContract> => {
  if (id === "example" || id === "master") {
    return fetchExampleContract(id);
  }

  const contract = await fetchFormDefinition(id, preview, draft);

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
