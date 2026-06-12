import { SCHOOL_EMAILS, SCHOOL_EMAIL_FALLBACK } from "@govtech-bb/registry";

/**
 * Resolves a submitted `primary-school` value to the school's notification
 * inbox. Registered as the `schoolEmail` JSONLogic op so a recipe's
 * `recipientField` can route per submission, e.g.
 * `{ "schoolEmail": { "var": "values.child-details.0.primary-school" } }`.
 *
 * Always returns a non-empty string (a real address, or the fallback for an
 * unmapped/null/empty key) — `resolveProcessors` validates the whole processor
 * batch together, so a missing/empty recipient here would drop every email on
 * the submission, including the applicant confirmation.
 */
export function schoolEmail(key: unknown): string {
  return SCHOOL_EMAILS[String(key)] ?? SCHOOL_EMAIL_FALLBACK;
}
