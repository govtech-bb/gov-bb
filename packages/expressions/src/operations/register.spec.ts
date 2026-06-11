import jsonLogic, { type RulesLogic } from "json-logic-js";
import { DateTime } from "luxon";
import { registerOperations } from "./register";
import { DEFAULT_ZONE } from "./zone";

describe("registerOperations", () => {
  beforeAll(() => registerOperations(jsonLogic));

  it("evaluates the age + if combination correctly for a senior", () => {
    // Deterministic 70-year-old DOB in DEFAULT_ZONE.
    const dob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 70 })
      .toISODate();
    const rule = {
      if: [{ ">=": [{ age: [{ var: "values.dob" }] }, 60] }, 0, 25],
    } as unknown as RulesLogic;
    expect(jsonLogic.apply(rule, { values: { dob } })).toBe(0);
  });

  it("evaluates the age + if combination correctly for a non-senior", () => {
    const dob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 30 })
      .toISODate();
    const rule = {
      if: [{ ">=": [{ age: [{ var: "values.dob" }] }, 60] }, 0, 25],
    } as unknown as RulesLogic;
    expect(jsonLogic.apply(rule, { values: { dob } })).toBe(25);
  });

  it("evaluates currency formatting via custom op", () => {
    expect(
      jsonLogic.apply(
        { currency: [{ var: "values.amt" }, "BBD"] } as unknown as RulesLogic,
        { values: { amt: 25 } },
      ),
    ).toMatch(/25/);
  });

  it("evaluates daysBetween via custom op", () => {
    expect(
      jsonLogic.apply(
        {
          daysBetween: [{ var: "values.start" }, { var: "values.end" }],
        } as unknown as RulesLogic,
        { values: { start: "2026-01-01", end: "2026-01-11" } },
      ),
    ).toBe(10);
  });

  it("evaluates today via custom op (returns ISO date)", () => {
    expect(jsonLogic.apply({ today: [] } as unknown as RulesLogic, {})).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("evaluates schoolEmail via custom op (routes by submitted school)", () => {
    // Mirrors the get-a-primary-school-textbook-grant recipe: the school is a
    // shared field with fieldId `child-school`, spread into each child-details
    // instance, so routing reads index 0 of the array.
    const rule = {
      schoolEmail: [{ var: "values.child-details.0.child-school" }],
    } as unknown as RulesLogic;
    expect(
      jsonLogic.apply(rule, {
        values: { "child-details": [{ "child-school": "st-george-primary" }] },
      }),
    ).toBe("StGeorgePrimary@mes.gov.bb");
  });
});
