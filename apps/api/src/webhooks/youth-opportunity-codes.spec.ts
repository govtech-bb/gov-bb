import {
  isYouthOpportunityFormId,
  resolveServiceCodeFromFormId,
  YOUTH_OPPORTUNITY_SERVICE_CODES,
} from "./youth-opportunity-codes";

describe("youth-opportunity-codes", () => {
  it("maps recipe formIds to their service codes", () => {
    // formId = `youth-opportunity-<opportunityId>`.
    const cases: Array<[string, string]> = [
      ["youth-opportunity-byac", "BYAC"],
      ["youth-opportunity-ydp", "YDP"],
      ["youth-opportunity-pathways", "PATH"],
      ["youth-opportunity-bright-sparks-2", "SPARKS"],
      ["youth-opportunity-cyber-security-training", "CYBER"],
      ["youth-opportunity-web-design-entrepreneurs", "WEBDEV"],
      ["youth-opportunity-national-summer-camp", "CAMP"],
      ["youth-opportunity-barbados-blooming-libraries", "BLOOM"],
      ["youth-opportunity-centre-access", "BOOKING"],
    ];
    for (const [formId, expected] of cases) {
      expect(resolveServiceCodeFromFormId(formId)).toBe(expected);
    }
  });

  it("recognises youth-opportunity formIds by prefix", () => {
    expect(isYouthOpportunityFormId("youth-opportunity-byac")).toBe(true);
    expect(isYouthOpportunityFormId("passport-renewal")).toBe(false);
  });

  it("returns null for a non-youth form", () => {
    expect(resolveServiceCodeFromFormId("passport-renewal")).toBeNull();
  });

  it("returns null for an unmapped youth-opportunity form", () => {
    expect(
      resolveServiceCodeFromFormId("youth-opportunity-mystery"),
    ).toBeNull();
  });

  it("does not map the retired BRIDGE and JOY forms", () => {
    expect(
      resolveServiceCodeFromFormId("youth-opportunity-bridge-to-future-2025"),
    ).toBeNull();
    expect(
      resolveServiceCodeFromFormId("youth-opportunity-spreading-joy-2025"),
    ).toBeNull();
    expect(
      YOUTH_OPPORTUNITY_SERVICE_CODES["bridge-to-future-2025"],
    ).toBeUndefined();
    expect(
      YOUTH_OPPORTUNITY_SERVICE_CODES["spreading-joy-2025"],
    ).toBeUndefined();
  });
});
