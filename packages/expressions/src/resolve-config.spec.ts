import jsonLogic from "json-logic-js";
import { DateTime } from "luxon";
import { resolveConfig } from "./resolve-config";
import { registerOperations } from "./operations/register";
import { DEFAULT_ZONE } from "./operations/zone";

beforeAll(() => registerOperations(jsonLogic));

describe("resolveConfig", () => {
  it("passes through a config of all literals", () => {
    const config = { to: "x@y.z", subject: "Hi", amount: 25 };
    expect(resolveConfig(config, { values: {} })).toEqual(config);
  });

  it("evaluates each field that is a rule", () => {
    const config = {
      to: { var: "values.email" },
      subject: "Application received",
      amount: { "*": [25, { var: "values.qty" }] },
    };
    expect(
      resolveConfig(config, { values: { email: "x@y.z", qty: 3 } }),
    ).toEqual({ to: "x@y.z", subject: "Application received", amount: 75 });
  });

  it("does NOT recurse into nested objects (passes them through unchanged)", () => {
    // The nested object itself is not a rule (multi-key) and is not a direct rule.
    // Authors who want rules in nested fields should declare those fields dynamic
    // in their schema and resolve at that level themselves.
    const nested = { foo: { var: "values.x" }, bar: "literal" };
    const config = { metadata: nested };
    expect(resolveConfig(config, { values: { x: 42 } })).toEqual({
      metadata: nested,
    });
  });

  it("integrates custom ops + senior pricing end-to-end", () => {
    const config = {
      amount: {
        if: [{ ">=": [{ age: [{ var: "values.applicant.dob" }] }, 60] }, 0, 25],
      },
      description: "Birth certificate fee",
    };

    const seniorDob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 70 })
      .toISODate();
    expect(
      resolveConfig(config, { values: { applicant: { dob: seniorDob } } }),
    ).toEqual({ amount: 0, description: "Birth certificate fee" });

    const youngDob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 30 })
      .toISODate();
    expect(
      resolveConfig(config, { values: { applicant: { dob: youngDob } } }),
    ).toEqual({ amount: 25, description: "Birth certificate fee" });
  });
});
