/** Explicit compatibility API; native module declarations do not depend on this target. */
export {
  defineLegacyField,
  defineLegacyContent,
  withLegacySsbField,
  withLegacySsbContent,
} from "./editor/legacy-contracts";

export type {
  FieldSsbHandler,
  ResolvedFieldSsbHandler,
  LegacyFieldDefinition,
  LegacyContentDefinition,
  ContentReadContext,
  ContentSsbHandler,
} from "./editor/legacy-contracts";

export { legacyFieldAdapter, legacyContentAdapter } from "./editor/legacy-mappings";

export { lexicalToLegacySsb } from "../converters/lexicalToLegacySsb";
