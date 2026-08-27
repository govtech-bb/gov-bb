import { describe, expect, it } from "vitest";
import type { ServiceContract } from "@govtech-bb/form-types";
import { resolveCopyFrom } from "./copy-from";
import type { StepScopedValues } from "./index";

/**
 * A cut-down stand-in for the swimming pool licence shape (#2507): the applicant
 * gives their own address, then a gate asks whether the pool is at that same
 * address, and the pool address mirrors the applicant's while it says yes.
 */
function contract(overrides?: {
  sourceStepId?: string;
  poolStepRepeatable?: boolean;
}): Pick<ServiceContract, "steps"> {
  const mirror = (fieldId: string, sourceFieldId: string) => ({
    fieldId,
    type: "text",
    label: fieldId,
    behaviours: [
      {
        type: "copyFrom" as const,
        // No `targetStepId`: the gate is on this same step, and omitting it is
        // what lets the evaluator read the CURRENT instance on a repeatable
        // step. An explicit targetStepId would pin every instance to
        // instance 0 — see resolveTargetValue in internals.ts.
        targetFieldId: "pool-same-address",
        operator: "equal" as const,
        value: "yes",
        sourceStepId: overrides?.sourceStepId ?? "your-details",
        sourceFieldId,
      },
    ],
  });

  return {
    steps: [
      {
        stepId: "your-details",
        title: "Your details",
        elements: [
          { fieldId: "your-address-line-1", type: "text", label: "Line 1" },
          { fieldId: "parish", type: "select", label: "Parish" },
        ],
      },
      {
        stepId: "pool-location",
        title: "Where is the pool?",
        elements: [
          { fieldId: "pool-same-address", type: "radio", label: "Same?" },
          mirror("pool-address-line-1", "your-address-line-1"),
          mirror("pool-parish", "parish"),
        ],
        ...(overrides?.poolStepRepeatable
          ? { behaviours: [{ type: "repeatable" as const, min: 1, max: 5 }] }
          : {}),
      },
    ],
  } as unknown as Pick<ServiceContract, "steps">;
}

const applicant = {
  "your-address-line-1": "1 Jemmotts Lane",
  parish: "st-michael",
};

describe("resolveCopyFrom", () => {
  it("mirrors the source into the target while the gate matches", () => {
    const values: StepScopedValues = {
      "your-details": applicant,
      "pool-location": { "pool-same-address": "yes" },
    };
    const { values: out, mirrored } = resolveCopyFrom(contract(), values);

    expect(out["pool-location"]).toMatchObject({
      "pool-address-line-1": "1 Jemmotts Lane",
      "pool-parish": "st-michael",
    });
    expect(mirrored.get("pool-location")).toEqual(
      new Set(["pool-address-line-1", "pool-parish"]),
    );
  });

  it("leaves the target alone when the gate does not match", () => {
    const values: StepScopedValues = {
      "your-details": applicant,
      "pool-location": {
        "pool-same-address": "no",
        "pool-address-line-1": "Sandy Lane, St James",
        "pool-parish": "st-james",
      },
    };
    const { values: out, mirrored } = resolveCopyFrom(contract(), values);

    expect(out["pool-location"]).toMatchObject({
      "pool-address-line-1": "Sandy Lane, St James",
      "pool-parish": "st-james",
    });
    expect(mirrored.size).toBe(0);
    // Nothing changed, so the same object is handed back.
    expect(out).toBe(values);
  });

  /**
   * The reason this is a derivation and not a one-shot write. A copy performed
   * when the gate flipped would still hold the OLD applicant address here, and
   * the catchment router reads the mirrored field — so a stale copy is a
   * silently misrouted submission.
   */
  it("re-derives after the source changes, never serving a stale copy", () => {
    const before: StepScopedValues = {
      "your-details": applicant,
      "pool-location": { "pool-same-address": "yes" },
    };
    const first = resolveCopyFrom(contract(), before);
    expect(first.values["pool-location"]).toMatchObject({
      "pool-address-line-1": "1 Jemmotts Lane",
    });

    // The applicant goes Back and corrects their address.
    const after: StepScopedValues = {
      ...first.values,
      "your-details": { ...applicant, "your-address-line-1": "Oistins" },
    };
    const second = resolveCopyFrom(contract(), after);

    expect(second.values["pool-location"]).toMatchObject({
      "pool-address-line-1": "Oistins",
    });
  });

  it("writes an empty source through rather than keeping the old answer", () => {
    const values: StepScopedValues = {
      "your-details": { "your-address-line-1": "", parish: "" },
      "pool-location": {
        "pool-same-address": "yes",
        "pool-address-line-1": "a previous answer",
      },
    };
    const { values: out } = resolveCopyFrom(contract(), values);

    // Loud (a required-field error) beats quiet (routing on a stale address).
    expect(
      (out["pool-location"] as Record<string, unknown>)["pool-address-line-1"],
    ).toBe("");
  });

  it("refuses a source inside a repeatable step instead of guessing an instance", () => {
    const values: StepScopedValues = {
      // A repeatable source: which instance would "the" address be?
      "your-details": [applicant, { "your-address-line-1": "Holetown" }],
      "pool-location": { "pool-same-address": "yes" },
    };
    const { values: out } = resolveCopyFrom(contract(), values);

    expect(
      (out["pool-location"] as Record<string, unknown>)["pool-address-line-1"],
    ).toBeUndefined();
  });

  it("mirrors into every instance of a repeatable target step", () => {
    const values: StepScopedValues = {
      "your-details": applicant,
      "pool-location": [
        { "pool-same-address": "yes" },
        { "pool-same-address": "no", "pool-address-line-1": "Holetown" },
      ],
    };
    const { values: out, mirrored } = resolveCopyFrom(
      contract({ poolStepRepeatable: true }),
      values,
    );
    const instances = out["pool-location"] as Array<Record<string, unknown>>;

    expect(instances[0]["pool-address-line-1"]).toBe("1 Jemmotts Lane");
    // Instance 1 said "no", so it keeps what was typed.
    expect(instances[1]["pool-address-line-1"]).toBe("Holetown");
    // The flat map is the instance-0 projection, like hiddenFieldIds.
    expect(mirrored.get("pool-location")).toContain("pool-address-line-1");
  });

  it("passes a contract with no copyFrom behaviours straight through", () => {
    const values: StepScopedValues = { "your-details": applicant };
    const bare = {
      steps: [
        {
          stepId: "your-details",
          title: "Your details",
          elements: [
            { fieldId: "your-address-line-1", type: "text", label: "Line 1" },
          ],
        },
      ],
    } as unknown as Pick<ServiceContract, "steps">;

    const { values: out, mirrored } = resolveCopyFrom(bare, values);
    expect(out).toBe(values);
    expect(mirrored.size).toBe(0);
  });

  it("does not mutate the input values", () => {
    const poolStep = { "pool-same-address": "yes" };
    const values: StepScopedValues = {
      "your-details": applicant,
      "pool-location": poolStep,
    };
    resolveCopyFrom(contract(), values);

    expect(poolStep).toEqual({ "pool-same-address": "yes" });
  });
});
