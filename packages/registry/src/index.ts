import type { Block, Primitive } from "@govtech-bb/form-types";
import { REGISTRY_BLOCKS } from "./blocks";
import { REGISTRY_COMPONENTS } from "./components";

export { REGISTRY_COMPONENTS, REGISTRY_PRIMITIVES } from "./components";
export { REGISTRY_BLOCKS } from "./blocks";

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
