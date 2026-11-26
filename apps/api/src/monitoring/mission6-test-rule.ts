/**
 * The Mission 6 "left out as a test" rule (option b, agreed 26 Nov 2026).
 *
 * An application or payment is left out of the Mission 6 figures when the
 * applicant looks like the delivery team testing a form rather than a member
 * of the public:
 *   - an email on a team or throwaway domain (govtech, public.digital,
 *     mailinator and similar, `example.`);
 *   - a test-style name (test, demo, dummy, sample, John Doe, Jane Doe);
 *   - an email named in the optional `TEST_APPLICANT_EMAILS` secret
 *     (comma or newline separated, matched case-insensitively).
 *
 * `@gov.bb` and `barbados.gov.bb` are deliberately NOT left out: public
 * servants apply for services as citizens too.
 *
 * The named inboxes live in a secret, never in code: this repo is public and
 * the list is staff email addresses.
 */

const TEAM_OR_THROWAWAY_DOMAIN =
  /(govtech|public\.digital|mailinator|yopmail|guerrillamail|trashmail|10minutemail|tempmail|sharklasers|example\.)/i;

const TEST_STYLE_NAME = /\b(test|demo|dummy|sample|john doe|jane doe)\b/i;

/** Answer keys that hold the applicant's email. */
const EMAIL_KEY = /email/i;

/** Field ids that hold a person's name (`first-name`, `applicant-last-name`,
 *  `surname`, `name`), not a business name. */
const PERSON_NAME_KEY =
  /^name$|(^|[-_])((first|last|middle|given|full|sur|family)[-_]?name|surname)$/i;

/**
 * The applicant identity answers pulled out of a submission: a flat map of
 * `"<stepId>.<fieldId>"` (or `"<fieldId>"` for a top-level answer) to its
 * text value, holding only keys whose field id mentions email or name.
 */
export type IdentityAnswers = Record<string, string | null> | null;

export function parseNamedTestInboxes(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@")),
  );
}

function fieldId(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? key : key.slice(dot + 1);
}

function stepId(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? "" : key.slice(0, dot);
}

/** True when the applicant looks like a team test, per the rule above. */
export function isTestApplicant(
  identity: IdentityAnswers,
  namedInboxes: Set<string>,
): boolean {
  if (!identity) return false;

  // Names are judged per step, so first + last name ("John" + "Doe") read
  // together as "John Doe".
  const namesByStep = new Map<string, string[]>();

  for (const [key, rawValue] of Object.entries(identity)) {
    const value = (rawValue ?? "").trim();
    if (!value) continue;
    const field = fieldId(key);

    if (EMAIL_KEY.test(field)) {
      const email = value.toLowerCase();
      if (TEAM_OR_THROWAWAY_DOMAIN.test(email)) return true;
      if (namedInboxes.has(email)) return true;
      continue;
    }

    if (PERSON_NAME_KEY.test(field)) {
      const step = stepId(key);
      const parts = namesByStep.get(step) ?? [];
      parts.push(value);
      namesByStep.set(step, parts);
    }
  }

  for (const parts of namesByStep.values()) {
    if (TEST_STYLE_NAME.test(parts.join(" "))) return true;
  }
  return false;
}
