import { primitiveSchema } from "@govtech-bb/form-types";
import { NationalInsuranceNumber } from "./national-insurance-number";

describe("NationalInsuranceNumber", () => {
  it("carries a hard input mask limiting input to exactly six digits", () => {
    // Maskito alphabet: 9 = digit. This hard-limits input to six digits,
    // mirroring the pattern validation `^\d{6}$` (e.g. 123456).
    expect(NationalInsuranceNumber.mask).toBe("999999");
  });

  it("validates against exactly six digits", () => {
    const { value } = NationalInsuranceNumber.validations!.pattern!;
    const re = new RegExp(value);
    expect(re.test("123456")).toBe(true);
    expect(re.test("12345")).toBe(false);
    expect(re.test("1234567")).toBe(false);
    expect(re.test("AB123456C")).toBe(false);
    expect(re.test("12345A")).toBe(false);
  });

  it("parses cleanly under the Primitive discriminated union", () => {
    expect(primitiveSchema.safeParse(NationalInsuranceNumber).success).toBe(
      true,
    );
  });
});
