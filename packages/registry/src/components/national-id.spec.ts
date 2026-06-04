import { primitiveSchema } from "@govtech-bb/form-types";
import { NationalIdNumber } from "./national-id";

describe("NationalIdNumber", () => {
  it("carries a hard input mask matching the National ID format (6 digits-4 digits)", () => {
    // Maskito alphabet: 9 = digit, literal `-` passes through. This hard-limits
    // input to ten digits with an auto-inserted dash, mirroring the existing
    // pattern validation `^\d{6}-\d{4}$` (e.g. 850101-0001). See issue #277.
    expect(NationalIdNumber.mask).toBe("999999-9999");
  });

  it("parses cleanly under the Primitive discriminated union", () => {
    expect(primitiveSchema.safeParse(NationalIdNumber).success).toBe(true);
  });
});
