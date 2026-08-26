import { describe, expect, it } from "vitest";
import type { ClientPrimitive } from "@forms/types";
import { applyMirrorReadOnly } from "./use-copy-from-mirrors";

function field(fieldId: string): ClientPrimitive {
  return {
    id: `pool-location_${fieldId}`,
    fieldId,
    stepId: "pool-location",
    name: fieldId,
    label: fieldId,
    htmlType: "text",
    disabled: false,
    hidden: false,
    conditionallyHidden: false,
  } as ClientPrimitive;
}

describe("applyMirrorReadOnly", () => {
  it("marks only the mirrored fields read-only", () => {
    const fields = [field("pool-address-line-1"), field("pool-same-address")];
    const out = applyMirrorReadOnly(fields, new Set(["pool-address-line-1"]));

    expect(out[0].readOnly).toBe(true);
    // The gate itself is a real question — it must stay editable, or the
    // applicant could never switch back to entering the pool's own address.
    expect(out[1].readOnly).toBeUndefined();
  });

  it("returns the same array when nothing is mirrored", () => {
    const fields = [field("pool-address-line-1")];
    expect(applyMirrorReadOnly(fields, new Set())).toBe(fields);
  });

  it("does not mutate the fields it is given", () => {
    const fields = [field("pool-address-line-1")];
    applyMirrorReadOnly(fields, new Set(["pool-address-line-1"]));
    expect(fields[0].readOnly).toBeUndefined();
  });
});
