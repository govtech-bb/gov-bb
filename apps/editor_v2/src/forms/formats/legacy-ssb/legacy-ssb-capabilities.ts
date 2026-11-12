import type { EditorState } from "lexical";
import type { LegacySsbFormSchema } from "./projection/schema";
import { capabilityWarnings as warnings, logicIssues as issues } from "./projection/capabilities";

export type { FormIssue, CapabilityWarning } from "./projection/capabilities";

/** Reading the authoring snapshot belongs at the editor boundary, not in the pure SSB adapter. */
export const logicIssues = (schema: LegacySsbFormSchema, state?: EditorState) =>
  issues(schema, state?.toJSON());

export const capabilityWarnings = (schema: LegacySsbFormSchema, state?: EditorState) =>
  warnings(schema, state?.toJSON());
