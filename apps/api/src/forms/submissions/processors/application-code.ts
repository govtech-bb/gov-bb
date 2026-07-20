import { createHash } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // 36 chars

/**
 * Catalogue of valid service prefixes. Sourced from frontend-alpha
 * (src/lib/application-code.ts) so the reference codes this backend issues to
 * the case-management webhook stay byte-for-byte compatible with the codes the
 * frontend issued before the dispatch moved server-side.
 *
 * Using a const object gives a compile-time-checked union type, so an invalid
 * prefix is a TypeScript error rather than a runtime surprise.
 */
export const SERVICES = {
  BYAC: "Barbados Youth Advance Corps",
  YDP: "Youth Development Programme",
  PATH: "Pathways Employability Programme",
  SPARKS: "Bright Sparks Educational Project 2.0",
  CIP: "Community Impact Programme",
  BTU: "Block Transformation Unit (Project Dawn)",
  CYBER: "Cyber Security Training Workshop",
  WEBDEV: "Web Page Design and Maintenance for Entrepreneurs",
  CAP: "Community Arts Programme",
  YES: "Youth Entrepreneurship Scheme – First Contact",
  YAR: "Youth Achieving Results",
  CANVAS: "Community Canvas",
  CAMP: "National Summer Camp Programme",
  CEEP: "Community Engagement and Educational Programme",
  MISSION: "Mission Barbados",
  BLOOM: "Barbados is Blooming (Little Libraries)",
  CMC: "Centre Management Committee",
  BOOKING: "Book a Community Centre",
} as const;

export type ServiceCode = keyof typeof SERVICES;

export function isServiceCode(value: string): value is ServiceCode {
  return value in SERVICES;
}

function formatDDMM(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

/**
 * Deterministic base36 suffix from a seed — each of the first `length` bytes of
 * a SHA-256 digest mapped into the 36-char alphabet. Same seed → same suffix.
 */
function deterministicSuffix(seed: string, length: number): string {
  const digest = createHash("sha256").update(seed).digest();
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[digest[i] % ALPHABET.length];
  }
  return result;
}

/**
 * Generate an application tracking code:
 *   <SERVICE>-<DDMM>-<7 base36 chars>   e.g. BYAC-0306-A1Z9QF3
 *
 * Deterministic: a pure function of `service`, `submissionId` and the
 * submission date. The old implementation drew the suffix from a CSPRNG at
 * dispatch time, which produced a DIFFERENT code on every SQS retry of the same
 * submission — now that case-management dispatch runs through the retried
 * submission-processor pipeline, the code must be stable across retries (and
 * unique, from the submission UUID). Format is unchanged for the CM system.
 */
export function generateApplicationCode(
  service: ServiceCode,
  submissionId: string,
  submittedAt: string,
): string {
  const datePart = formatDDMM(new Date(submittedAt));
  const suffix = deterministicSuffix(`${service}:${submissionId}`, 7);
  return `${service}-${datePart}-${suffix}`;
}
