/** Explicit compatibility API; native module declarations do not depend on this target. */
export {
  defineLegacyField,
  defineLegacyContent,
  withLegacySsbField,
  withLegacySsbContent,
} from "./formats/legacy-ssb/legacy-contracts";

export type {
  FieldSsbHandler,
  ResolvedFieldSsbHandler,
  LegacyFieldDefinition,
  LegacyContentDefinition,
  ContentReadContext,
  ContentSsbHandler,
} from "./formats/legacy-ssb/legacy-contracts";

export { legacyFieldAdapter, legacyContentAdapter } from "./formats/legacy-ssb/legacy-mappings";

export { lexicalToLegacySsb } from "../converters/lexical-to-legacy-ssb";
