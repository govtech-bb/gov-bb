// Responsible for fetching a form

import { ClientServiceContract } from "@web/types";
import exampleServiceContract from "../../../contracts/example-service-contract.json";
import masterContract from "../../../contracts/master-contract.json";
import { ServiceContract, serviceContractSchema } from "@govtech-bb/form-types";
import { mapContractToLocale } from "./field-mapper";

/* 
 The process is:
 
 1. Accept a form ID, and request the service contract from cache, or if missed, from the server.
 2. Check cache for a previously built form. 
  - If hit, compare version with fetched schema. If match, serve that form, and exit. Otherwise...
 3. Convert ServiceContract to a ClientServiceContract
 4. Generate validation rules as a Zod schema, and an object satisfying form.Validators.
 5. Render form, along with behavioral rules accounted for.
 6. Cache, with a cache key of: `form-schema:${schemaId}:${version}`
 7. Returns data necessary for the form to render. (FormMeta object)
*/

// TODO: Replace with actual fetching from server logic
export const fetchContract = async (
  id: string = "example",
): Promise<ClientServiceContract> => {
  console.warn("Fetching examples... ID: " + id);
  return fetchExampleContract(id);
};

export const fetchExampleContract = async (
  id: string,
): Promise<ClientServiceContract> => {
  let contract: ServiceContract;

  if (id === "master") {
    contract = serviceContractSchema.parse(masterContract);
  } else {
    contract = serviceContractSchema.parse(exampleServiceContract);
  }

  return mapContractToLocale(contract);
};
