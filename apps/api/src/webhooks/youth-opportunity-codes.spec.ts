import {
  FORM_ID_SERVICE_CODES,
  isYouthOpportunityFormId,
  resolveServiceCodeFromFormId,
} from "./youth-opportunity-codes";

describe("youth-opportunity-codes", () => {
  it("maps prefixed recipe formIds to their service codes", () => {
    const cases: Array<[string, string]> = [
      ["youth-opportunity-byac", "BYAC"],
      ["youth-opportunity-ydp", "YDP"],
      ["youth-opportunity-pathways", "PATH"],
      ["youth-opportunity-bright-sparks-2", "SPARKS"],
      ["youth-opportunity-barbados-blooming-libraries", "BLOOM"],
      ["youth-opportunity-centre-access", "BOOKING"],
    ];
    for (const [formId, expected] of cases) {
      expect(resolveServiceCodeFromFormId(formId)).toBe(expected);
    }
  });

  it("maps bare (unprefixed) recipe formIds to their service codes", () => {
    // These recipes predate the `youth-opportunity-` naming convention and ship
    // a bare formId. A prefix-strip resolver dropped them silently; keying on
    // the exact formId dispatches them. Regression guard for the case-management
    // gap (e.g. Cyber Security Training Workshop never reached the webhook).
    const cases: Array<[string, string]> = [
      ["cyber-security-training", "CYBER"],
      ["web-design-entrepreneurs", "WEBDEV"],
      ["yes", "YES"],
      ["yar", "YAR"],
      ["national-summer-camp", "CAMP"],
      ["mission-barbados", "MISSION"],
    ];
    for (const [formId, expected] of cases) {
      expect(resolveServiceCodeFromFormId(formId)).toBe(expected);
    }
  });

  it("recognises mapped youth-opportunity formIds", () => {
    expect(isYouthOpportunityFormId("youth-opportunity-byac")).toBe(true);
    expect(isYouthOpportunityFormId("cyber-security-training")).toBe(true);
    expect(isYouthOpportunityFormId("passport-renewal")).toBe(false);
  });

  it("returns null for a non-youth form", () => {
    expect(resolveServiceCodeFromFormId("passport-renewal")).toBeNull();
  });

  it("matches exactly — does not dispatch a same-stemmed sibling recipe", () => {
    // The standalone `ydp` recipe is distinct from `youth-opportunity-ydp` and
    // must not be dispatched; only the prefixed form is mapped.
    expect(resolveServiceCodeFromFormId("ydp")).toBeNull();
    expect(FORM_ID_SERVICE_CODES["ydp"]).toBeUndefined();
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
    expect(FORM_ID_SERVICE_CODES["bridge-to-future-2025"]).toBeUndefined();
    expect(FORM_ID_SERVICE_CODES["spreading-joy-2025"]).toBeUndefined();
  });
});
