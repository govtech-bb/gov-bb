import { primitiveSchema } from "@govtech-bb/form-types";
import { TamisNumber } from "./tamis-number";

describe("TamisNumber", () => {
  it("renders as a text field, not a number field", () => {
    expect(TamisNumber.htmlType).toBe("text");
  });

  it("restricts input to digits only", () => {
    expect(TamisNumber.validations?.pattern?.value).toBe("^\\d*$");
  });

  it("requires at least 10 digits", () => {
    expect(TamisNumber.validations?.minLength?.value).toBe(10);
  });

  it("allows at most 15 digits", () => {
    expect(TamisNumber.validations?.maxLength?.value).toBe(15);
  });

  it("parses cleanly under the Primitive discriminated union", () => {
    expect(primitiveSchema.safeParse(TamisNumber).success).toBe(true);
  });
});
