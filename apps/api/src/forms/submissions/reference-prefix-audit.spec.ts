import { auditReferencePrefixes } from "./reference-prefix-audit";

const form = (
  formId: string,
  mdaCode: string | undefined,
  ministryKey: string | null,
) => ({ formId, mdaCode, ministryKey });

describe("auditReferencePrefixes", () => {
  it("reports nothing for a consistent set", () => {
    expect(
      auditReferencePrefixes([
        form("temp-restaurant-licence", "MOH", "health"),
        form("environmental-health-officer", "MOH", "health"),
        form("youth-opportunity-byac", "MYS", "youth"),
      ]),
    ).toEqual([]);
  });

  it("flags two forms of one ministry declaring different MDA codes", () => {
    const issues = auditReferencePrefixes([
      form("temp-restaurant-licence", "MOH", "health"),
      form("environmental-health-officer", "MHO", "health"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("health");
    expect(issues[0]).toContain("MHO");
  });

  it("flags one MDA code claimed by two ministries", () => {
    const issues = auditReferencePrefixes([
      form("a", "MOH", "health"),
      form("b", "MOH", "youth"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("MOH");
  });

  it("flags MDA codes that are distinct but canonicalise the same", () => {
    // LOM and IOM both canonicalise to 10M — indistinguishable to a clerk.
    const issues = auditReferencePrefixes([
      form("a", "LOM", "labour"),
      form("b", "IOM", "immigration"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("10M");
  });

  it("ignores forms that declare no MDA code", () => {
    expect(
      auditReferencePrefixes([
        form("unmigrated", undefined, "health"),
        form("temp-restaurant-licence", "MOH", "health"),
      ]),
    ).toEqual([]);
  });

  it("skips the ministry cross-check for a form with no MDA link", () => {
    // No form_config row in this environment — nothing to cross-check against,
    // and that is a provisioning question, not a reference-code one.
    expect(
      auditReferencePrefixes([
        form("temp-restaurant-licence", "MOH", null),
        form("environmental-health-officer", "MOH", "health"),
      ]),
    ).toEqual([]);
  });
});
