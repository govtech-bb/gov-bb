/**
 * Catalogue of valid programme/service codes. Sourced from frontend-alpha
 * (src/lib/application-code.ts). Used to validate the `programmeCode` an
 * author configures on a `case-management` processor, and as the self-
 * identifying prefix of the submission reference (#1458).
 *
 * BRIDGE ("Bridge to the Future Workshop") and JOY ("Spreading Joy at
 * Christmas") were dropped: those forms have been removed from staging and are
 * no longer offered.
 *
 * Using a const object gives a compile-time-checked union type, so an invalid
 * code is a TypeScript error rather than a runtime surprise.
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
