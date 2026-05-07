import jsonLogic from "json-logic-js";
import { DateTime } from "luxon";
import { applyIfRule } from "./apply-if-rule";
import { registerOperations } from "./operations/register";
import { DEFAULT_ZONE } from "./operations/zone";

beforeAll(() => registerOperations(jsonLogic));

describe("applyIfRule", () => {
  it("returns primitives unchanged", () => {
    expect(applyIfRule(42, { values: {} })).toBe(42);
    expect(applyIfRule("plain", { values: {} })).toBe("plain");
    expect(applyIfRule(null, { values: {} })).toBe(null);
    expect(applyIfRule(true, { values: {} })).toBe(true);
  });

  it("returns plain multi-key objects unchanged", () => {
    const obj = { name: "Marcus", age: 42 };
    expect(applyIfRule(obj, { values: {} })).toBe(obj);
  });

  it("returns arrays unchanged (not recursed)", () => {
    const arr = [1, 2, 3];
    expect(applyIfRule(arr, { values: {} })).toBe(arr);
  });

  it("evaluates a var rule", () => {
    expect(applyIfRule({ var: "values.n" }, { values: { n: 42 } })).toBe(42);
  });

  it("evaluates an arithmetic rule", () => {
    expect(
      applyIfRule(
        { "*": [25, { var: "values.quantity" }] },
        { values: { quantity: 3 } },
      ),
    ).toBe(75);
  });

  it("evaluates an if/age rule for a senior", () => {
    const seniorDob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 70 })
      .toISODate();
    expect(
      applyIfRule(
        {
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        },
        { values: { applicant: { dob: seniorDob } } },
      ),
    ).toBe(0);
  });

  it("evaluates an if/age rule for a non-senior", () => {
    const youngDob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 30 })
      .toISODate();
    expect(
      applyIfRule(
        {
          if: [
            { ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] },
            0,
            25,
          ],
        },
        { values: { applicant: { dob: youngDob } } },
      ),
    ).toBe(25);
  });

  it("returns single-key objects whose key is not a registered operator unchanged", () => {
    const literal = { name: "Alice" };
    expect(applyIfRule(literal, { values: {} })).toBe(literal);
  });
});
