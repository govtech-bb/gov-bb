// Responsible for fetching a form contract from the API.

import { ClientServiceContract } from "@forms/types";
import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { mapContractToLocale } from "./field-mapper";
import exampleServiceContract from "../../../contracts/example-service-contract.json";
import masterContract from "../../../contracts/master-contract.json";
import { fetchFormDefinition } from "@forms/form-api";
import { getPreviewContract } from "./preview-contracts";

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

  // Preview builds (VITE_PREVIEW_CONTRACTS=1) prefer the branch's bundled
  // contract for this form — so both NEW and CHANGED branch forms render from
  // the branch, not a stale sandbox copy. Inert in every normal build.
  if (import.meta.env.VITE_PREVIEW_CONTRACTS) {
    const previewContract = getPreviewContract(id);
    if (previewContract) {
      return mapContractToLocale(previewContract);
    }
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
