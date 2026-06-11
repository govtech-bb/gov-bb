import { SCHOOL_EMAIL_FALLBACK } from "@govtech-bb/registry";
import { schoolEmail } from "./school-email";

describe("schoolEmail", () => {
  it("resolves a known school key to its mapped address", () => {
    expect(schoolEmail("st-george-primary")).toBe("StGeorgePrimary@mes.gov.bb");
  });

  it("preserves the elliot-belgrave -> BoscobelPrimary rename", () => {
    expect(schoolEmail("elliot-belgrave")).toBe("BoscobelPrimary@mes.gov.bb");
  });

  it("returns the fallback for an unmapped key", () => {
    expect(schoolEmail("not-a-real-school")).toBe(SCHOOL_EMAIL_FALLBACK);
  });

  it("returns the fallback for null", () => {
    expect(schoolEmail(null)).toBe(SCHOOL_EMAIL_FALLBACK);
  });

  it("returns the fallback for undefined", () => {
    expect(schoolEmail(undefined)).toBe(SCHOOL_EMAIL_FALLBACK);
  });

  it("never returns an empty string", () => {
    expect(schoolEmail("")).toBeTruthy();
  });
});
