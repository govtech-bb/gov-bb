import type { Processor } from "@govtech-bb/form-types";
import type { AuthorableProcessorType } from "./types";

/**
 * A minimal, mostly-blank default processor for each type the builder can
 * author, used to seed a new entry when the author clicks "Add". Returns a full
 * `{ type, config }` (not just config) so each `switch` branch is a concrete
 * discriminated-union member — callers can spread an editor id over it without
 * losing the `type`↔`config` correlation.
 *
 * Defaults intentionally leave required fields blank (e.g. `recipientField`,
 * `url`): the author fills them in, and the existing server Validate flow
 * catches anything still missing. The webhook `secret` is never seeded — a
 * plaintext HMAC key does not belong in the git-committed recipe (issue #255).
 * `payment` is deliberately not authorable (see {@link AuthorableProcessorType}).
 */
export function makeDefaultProcessor(type: AuthorableProcessorType): Processor {
  switch (type) {
    case "email":
      return { type: "email", config: { recipientField: "" } };
    case "webhook":
      return {
        type: "webhook",
        config: {
          url: "",
          method: "POST",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10_000,
        },
      };
    case "spreadsheet":
      return { type: "spreadsheet", config: {} };
    case "opencrvs":
      return { type: "opencrvs", config: {} };
  }
}
