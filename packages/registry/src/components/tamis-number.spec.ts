import { primitiveSchema } from "@govtech-bb/form-types";
import { TamisNumber } from "./tamis-number";

describe("TamisNumber", () => {
  it("renders as a text field, not a number field", () => {
    expect(TamisNumber.htmlType).toBe("text");
  });

  it("restricts input to one-or-more digits", () => {
    expect(TamisNumber.validations?.pattern?.value).toBe("^\\d+$");
  });

  // #2073: the old pattern `^\d*$` matched the empty string on its own (only
  // minLength saved it). `^\d+$` must reject an empty value by itself.
  it("pattern rejects an empty value on its own", () => {
    const re = new RegExp(TamisNumber.validations!.pattern!.value);
    expect(re.test("")).toBe(false);
    expect(re.test("1234567890")).toBe(true);
    expect(re.test("12345abc")).toBe(false);
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
