import {
  FORM_ID_SERVICE_CODES,
  isYouthOpportunityFormId,
  resolveServiceCodeFromFormId,
} from "./youth-opportunity-codes";

describe("youth-opportunity-codes", () => {
  // #841/#1458: the map has been drained — every programme now dispatches via
  // the declarative `webhook` processor in its recipe (code = the submission's
  // referenceCode), not this legacy listener. A migrated formId is removed from
  // the map so it is no longer dispatched here (avoiding a double dispatch).

  it("is empty — all programmes migrated to the mapped webhook processor", () => {
    expect(Object.keys(FORM_ID_SERVICE_CODES)).toHaveLength(0);
  });

  it("no longer resolves formerly-mapped forms (they dispatch via the processor)", () => {
    for (const formId of [
      "youth-opportunity-byac",
      "cyber-security-training",
      "national-summer-camp",
      "mission-barbados",
    ]) {
      expect(resolveServiceCodeFromFormId(formId)).toBeNull();
      expect(isYouthOpportunityFormId(formId)).toBe(false);
    }
  });

  it("returns null for any form", () => {
    expect(resolveServiceCodeFromFormId("passport-renewal")).toBeNull();
    expect(isYouthOpportunityFormId("passport-renewal")).toBe(false);
  });
});
