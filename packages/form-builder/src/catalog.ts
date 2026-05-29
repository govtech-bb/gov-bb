import { BUILTIN_COMPONENTS, BUILTIN_BLOCKS } from "./builtins/index";
import type { ComponentDefinition, BlockDefinition } from "./definition-types";
import type { Primitive } from "@govtech-bb/form-types";
import { REGISTRY_COMPONENTS, REGISTRY_BLOCKS } from "@govtech-bb/registry";

export type { ComponentDefinition, BlockDefinition };

export interface CustomComponentEntry {
  ref: string; // e.g. "components/custom-my-widget"
  displayName: string;
  namespace: string;
  type: string;
  definition: Record<string, unknown>;
}

export interface RegistryCatalog {
  components: ComponentDefinition[];
  blocks: BlockDefinition[];
  custom: CustomComponentEntry[]; // populated by server layer; empty here
}

// Returns builtin catalog only (no DB — server layer merges custom)
export function getCatalog(): RegistryCatalog {
  return {
    components: BUILTIN_COMPONENTS,
    blocks: BUILTIN_BLOCKS,
    custom: [],
  };
}

export function getRegistryItem(
  ref: string,
  catalog: RegistryCatalog,
): ComponentDefinition | BlockDefinition | undefined {
  if (ref.startsWith("components/")) {
    const found = catalog.components.find((c) => c.ref === ref);
    if (found) return found;

    const custom = catalog.custom.find((c) => c.ref === ref);
    if (custom) {
      return {
        ref: custom.ref,
        displayName: custom.displayName,
        primitive: custom.definition as unknown as Primitive,
      };
    }

    const registry = REGISTRY_COMPONENTS[ref as `components/${string}`];
    if (registry) {
      return { ref, displayName: registry.label, primitive: registry };
    }
    return undefined;
  }
  if (ref.startsWith("blocks/")) {
    const found = catalog.blocks.find((b) => b.ref === ref);
    if (found) return found;

    const registry = REGISTRY_BLOCKS[ref as `blocks/${string}`];
    if (registry) {
      return { ref, displayName: registry.blockId, block: registry };
    }
    return undefined;
  }
  return undefined;
}
