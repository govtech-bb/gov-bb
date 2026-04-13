// Responsible for fetching a form

import { ClientServiceContract } from "@web/types";
import exampleServiceContract from "../../../contracts/example-service-contract.json"
import { serviceContractSchema } from "@govtech-bb/form-types";
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
 7. Returns data necessary for the form to render. (ClientServiceContract object)
*/

export const fetchContract = (id: string): ClientServiceContract => {
  throw new Error("Not Implemented");
}

export const fetchExampleContract = (): ClientServiceContract => {
  const contract = serviceContractSchema.parse(exampleServiceContract)

  return mapContractToLocale(contract);
}
