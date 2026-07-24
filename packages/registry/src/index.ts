import type { Block, Primitive } from "@govtech-bb/form-types";
import { REGISTRY_BLOCKS } from "./blocks";
import { REGISTRY_COMPONENTS } from "./components";

export { REGISTRY_COMPONENTS, REGISTRY_PRIMITIVES } from "./components";
export { SCHOOL_EMAILS, SCHOOL_EMAIL_FALLBACK } from "./components";
export { REGISTRY_BLOCKS } from "./blocks";
export {
  PERSON_NAME_PATTERN,
  PERSON_NAME_ALLOWED,
} from "./person-name-pattern";
export {
  NATIONAL_ID_FORMAT,
  NATIONAL_INSURANCE_FORMAT,
  POSTCODE_FORMAT,
  TAMIS_FORMAT,
} from "./barbados-id-patterns";
export type { IdFormat } from "./barbados-id-patterns";

/** A resolvable builtin registry entry: a single primitive or a composite block. */
export type RegistryEntry = Primitive | Block;

/**
 * The complete builtin registry, keyed by ref (`components/{fieldId}`,
 * `blocks/{blockId}`). The single source of truth consumed by the api's
 * RegistryService.
 */
export const BUILTIN_REGISTRY: Record<string, RegistryEntry> = {
  ...REGISTRY_COMPONENTS,
  ...REGISTRY_BLOCKS,
};
