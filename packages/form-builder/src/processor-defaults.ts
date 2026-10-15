import type { Processor } from "@govtech-bb/form-types";
import type { AuthorableProcessorPreset } from "./types";

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
 * `payment` is now authorable too (#716): its provider is fixed to `ezpay` and
 * the path/amount fields start blank for the author to fill in.
 */
export function makeDefaultProcessor(
  preset: AuthorableProcessorPreset,
): Processor {
  switch (preset) {
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
    case "webhook-cams":
      // No url/endpoint/auth: a mapped webhook resolves its URL and API key
      // per-MDA (#2684). method/signatureHeader/timeoutMs are the schema
      // defaults, required by the parsed Processor type.
      return {
        type: "webhook",
        config: {
          method: "POST",
          signatureHeader: "X-Webhook-Signature",
          timeoutMs: 10_000,
          mapping: {
            programmeCode: "",
            applicant: { name: [], email: "", phone: "" },
            // Mirrors the builder's REQUIRED_STEP_IDS — every draft has these.
            excludeSteps: [
              "check-your-answers",
              "declaration",
              "submission-confirmation",
            ],
            groupByStep: true,
          },
        },
      };
    case "spreadsheet":
      return { type: "spreadsheet", config: {} };
    case "opencrvs":
      return { type: "opencrvs", config: {} };
    case "payment":
      return {
        type: "payment",
        config: {
          provider: "ezpay",
          department: "",
          paymentCode: "",
          // `amount` is templatable (dynamic()) but a numeric literal here; 0 is
          // a valid nonnegative default the author overrides.
          amount: 0,
          description: "",
          customerEmailPath: "",
          customerNamePath: "",
        },
      };
  }
}
