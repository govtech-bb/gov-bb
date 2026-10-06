import type { FieldIssue } from "../../core/fields";

export class UnavailableSsbOutput extends Error {
  constructor(readonly diagnostics: FieldIssue[]) {
    super(diagnostics.map((issue) => issue.message).join("; "));
  }
}
