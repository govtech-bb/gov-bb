import type { EditorState } from "lexical";
import type { LegacySsbFormSchema } from "../adapters/ssb/schema";
import {
  capabilityWarnings as warnings,
  logicIssues as issues,
} from "../adapters/ssb/capabilities";

export type { FormIssue, CapabilityWarning } from "../adapters/ssb/capabilities";

/** Reading the authoring snapshot belongs at the editor boundary, not in the pure SSB adapter. */
export const logicIssues = (schema: LegacySsbFormSchema, state?: EditorState) =>
  issues(schema, state?.toJSON());

export const capabilityWarnings = (schema: LegacySsbFormSchema, state?: EditorState) =>
  warnings(schema, state?.toJSON());
