import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // 36 chars

/**
 * Catalogue of valid service prefixes. Sourced from frontend-alpha
 * (src/lib/application-code.ts) so the reference codes this backend issues to
 * the case-management webhook stay byte-for-byte compatible with the codes the
 * frontend issued before the dispatch moved server-side.
 *
 * BRIDGE ("Bridge to the Future Workshop") and JOY ("Spreading Joy at
 * Christmas") were dropped: those forms have been removed from staging and are
 * no longer offered.
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

/** 3-char base36 counter capacity (no persistent counter is wired up). */
const COUNTER_CAPACITY = 36 ** 3;

export function isServiceCode(value: string): value is ServiceCode {
  return value in SERVICES;
}

function encodeBase36(n: number, width: number): string {
  if (n < 0) throw new Error("Counter must be non-negative");
  if (n >= 36 ** width) {
    throw new Error(`Counter ${n} exceeds capacity for width ${width}`);
  }
  return n.toString(36).toUpperCase().padStart(width, "0");
}

function randomSuffix(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return result;
}

function formatDDMM(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}`;
}

/**
 * Generate an application tracking code:
 *   <SERVICE>-<DDMM>-<counter><random>   e.g. BYAC-0306-A1Z9QF
 *
 * The 3-char counter slot is filled with a CSPRNG integer (no persistent
 * counter exists); the 4-char random suffix keeps collision risk negligible.
 */
export function generateApplicationCode(
  service: ServiceCode,
  applicationId: number,
  date: Date = new Date(),
): string {
  const datePart = formatDDMM(date);
  const counterPart = encodeBase36(applicationId, 3);
  const randomPart = randomSuffix(4);
  return `${service}-${datePart}-${counterPart}${randomPart}`;
}

/** Issue a fresh tracking code for a service, mirroring the frontend action. */
export function generateApplicationCodeForService(
  service: ServiceCode,
): string {
  return generateApplicationCode(service, randomInt(0, COUNTER_CAPACITY));
}
