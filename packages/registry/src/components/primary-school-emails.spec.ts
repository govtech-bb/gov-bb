import { PrimarySchool } from "./primary-school";
import { SCHOOL_EMAILS, SCHOOL_EMAIL_FALLBACK } from "./primary-school-emails";

describe("SCHOOL_EMAILS", () => {
  const optionValues = PrimarySchool.options.map((o) => o.value);

  it("has an email entry for every PrimarySchool option (no missing keys)", () => {
    const missing = optionValues.filter((v) => !(v in SCHOOL_EMAILS));
    expect(missing).toEqual([]);
  });

  it("has no orphan keys (every mapped key is a real PrimarySchool option)", () => {
    const optionSet = new Set(optionValues);
    const orphans = Object.keys(SCHOOL_EMAILS).filter((k) => !optionSet.has(k));
    expect(orphans).toEqual([]);
  });

  it("maps every entry to a non-empty @mes.gov.bb address", () => {
    const bad = Object.entries(SCHOOL_EMAILS).filter(
      ([, email]) => !email || !/@mes\.gov\.bb$/.test(email),
    );
    expect(bad).toEqual([]);
  });

  it("preserves the elliot-belgrave -> BoscobelPrimary rename (not a typo)", () => {
    expect(SCHOOL_EMAILS["elliot-belgrave"]).toBe("BoscobelPrimary@mes.gov.bb");
  });

  it("exposes a non-empty fallback address", () => {
    expect(SCHOOL_EMAIL_FALLBACK).toBeTruthy();
    expect(SCHOOL_EMAIL_FALLBACK).toContain("@");
  });
});
