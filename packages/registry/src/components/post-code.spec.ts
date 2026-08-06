import { primitiveSchema } from "@govtech-bb/form-types";
import { Postcode } from "./post-code";

describe("Postcode", () => {
  it("validates against the Barbados BB##### shape", () => {
    const re = new RegExp(Postcode.validations!.pattern!.value);
    expect(re.test("BB17004")).toBe(true);
    expect(re.test("17004")).toBe(false);
    expect(re.test("BB1700")).toBe(false);
    expect(re.test("bb17004")).toBe(false);
  });

  it("carries the normalised error message", () => {
    expect(Postcode.validations!.pattern!.error).toBe(
      "Enter a valid postcode (for example, BB17004)",
    );
  });

  it("parses cleanly under the Primitive discriminated union", () => {
    expect(primitiveSchema.safeParse(Postcode).success).toBe(true);
  });
});
