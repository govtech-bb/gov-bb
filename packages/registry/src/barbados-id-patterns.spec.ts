import {
  NATIONAL_ID_FORMAT,
  NATIONAL_INSURANCE_FORMAT,
  POSTCODE_FORMAT,
  TAMIS_FORMAT,
} from "./barbados-id-patterns";

describe("barbados-id-patterns", () => {
  describe("NATIONAL_ID_FORMAT", () => {
    const re = new RegExp(NATIONAL_ID_FORMAT.pattern);
    it("accepts the DDMMYY-SSSS shape", () => {
      expect(re.test("850101-0001")).toBe(true);
    });
    it("rejects a missing dash / wrong lengths", () => {
      expect(re.test("8501010001")).toBe(false);
      expect(re.test("85010-0001")).toBe(false);
      expect(re.test("")).toBe(false);
    });
    it("carries the matching mask and a normalised error", () => {
      expect(NATIONAL_ID_FORMAT.mask).toBe("999999-9999");
      expect(NATIONAL_ID_FORMAT.error).toBe(
        "Enter a valid National ID number (for example, 850101-0001)",
      );
    });
  });

  describe("NATIONAL_INSURANCE_FORMAT", () => {
    const re = new RegExp(NATIONAL_INSURANCE_FORMAT.pattern);
    it("accepts exactly six digits", () => {
      expect(re.test("123456")).toBe(true);
      expect(re.test("12345")).toBe(false);
      expect(re.test("1234567")).toBe(false);
    });
  });

  describe("POSTCODE_FORMAT", () => {
    const re = new RegExp(POSTCODE_FORMAT.pattern);
    it("accepts BB + five digits", () => {
      expect(re.test("BB17004")).toBe(true);
      expect(re.test("17004")).toBe(false);
      expect(re.test("BB1700")).toBe(false);
    });
    it("has no mask (variable-shape input)", () => {
      expect(POSTCODE_FORMAT.mask).toBeUndefined();
    });
  });

  describe("TAMIS_FORMAT", () => {
    const re = new RegExp(TAMIS_FORMAT.pattern);
    // #2073: `^\d+$`, not the old `^\d*$` which matched the empty string.
    it("rejects an empty value and accepts one-or-more digits", () => {
      expect(re.test("")).toBe(false);
      expect(re.test("1234567890")).toBe(true);
      expect(re.test("12a")).toBe(false);
    });
  });
});
