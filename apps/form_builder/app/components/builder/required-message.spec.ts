/**
 * #2710: a required field whose error message doesn't name the field ships an
 * unusable error — the forms error summary uses the message verbatim as its
 * link text, so "This field is required" three times is three identical links.
 *
 * These are the two pure decisions behind the field editor's Required
 * controls: what the checkbox writes, and when a label edit may rewrite the
 * message. Both must leave crafted copy alone — silently overwriting an
 * authored string is the same class of bug as the clobber they fix.
 */
import {
  GENERIC_REQUIRED_MSG,
  deriveRequiredMessage,
  requiredRuleOnTick,
  syncRequiredMessageToLabel,
} from "./required-message";

describe("deriveRequiredMessage", () => {
  it("names the field", () => {
    expect(deriveRequiredMessage("Date of endorsement")).toBe(
      "Date of endorsement is required",
    );
  });

  it("trims the label so a half-typed trailing space doesn't double up", () => {
    expect(deriveRequiredMessage("Employer name ")).toBe(
      "Employer name is required",
    );
  });
});

describe("requiredRuleOnTick", () => {
  it("carries the base's message forward instead of clobbering it", () => {
    // The bug: a bare `{ value: true }` replaces the base's whole `required`
    // object (validations merge shallow at the rule level), destroying a
    // message the registry shipped.
    expect(
      requiredRuleOnTick({
        validations: undefined,
        baseValidations: {
          required: { value: true, error: "Email address is required" },
        },
        defaultRequired: false,
        label: "Email address",
      }),
    ).toEqual({ value: true, error: "Email address is required" });
  });

  it("derives from the label when the base message is the generic sentinel", () => {
    // The generic primitives ship the sentinel as their base message, so
    // carrying it forward would just relocate the defect.
    expect(
      requiredRuleOnTick({
        validations: undefined,
        baseValidations: {
          required: { value: true, error: GENERIC_REQUIRED_MSG },
        },
        defaultRequired: true,
        label: "Employer name",
      }),
    ).toEqual({ value: true, error: "Employer name is required" });
  });

  it("derives from the label when the base declares no required rule", () => {
    expect(
      requiredRuleOnTick({
        validations: undefined,
        baseValidations: { minLength: { value: 2 } },
        defaultRequired: false,
        label: "Middle name",
      }),
    ).toEqual({ value: true, error: "Middle name is required" });
  });

  it("drops the override entirely when the base already requires the field with a good message", () => {
    // Re-ticking a base-required field: inheritance is the truthful state, and
    // a redundant copy of the base message would go stale if the registry
    // changed it.
    expect(
      requiredRuleOnTick({
        validations: { required: { value: false } },
        baseValidations: {
          required: { value: true, error: "Last name is required" },
        },
        defaultRequired: true,
        label: "Last name",
      }),
    ).toBeUndefined();
  });

  it("keeps a message the author already typed", () => {
    expect(
      requiredRuleOnTick({
        validations: {
          required: { value: false, error: "Enter your employer's name" },
        },
        baseValidations: {
          required: { value: true, error: "Last name is required" },
        },
        defaultRequired: true,
        label: "Last name",
      }),
    ).toEqual({ value: true, error: "Enter your employer's name" });
  });

  it("writes a bare rule when there is no label to derive from", () => {
    expect(
      requiredRuleOnTick({
        validations: undefined,
        baseValidations: undefined,
        defaultRequired: false,
        label: undefined,
      }),
    ).toEqual({ value: true });
  });
});

describe("syncRequiredMessageToLabel", () => {
  const args = {
    validations: undefined,
    baseValidations: undefined,
    defaultRequired: false,
    previousLabel: "Old label",
    nextLabel: "New label",
  };

  it("fills a message the field doesn't have yet", () => {
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations: { required: { value: true } },
      }),
    ).toEqual({ required: { value: true, error: "New label is required" } });
  });

  it("replaces the generic sentinel", () => {
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations: { required: { value: true, error: GENERIC_REQUIRED_MSG } },
      }),
    ).toEqual({ required: { value: true, error: "New label is required" } });
  });

  it("re-derives a message that still names the previous label", () => {
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations: {
          required: { value: true, error: "Old label is required" },
        },
      }),
    ).toEqual({ required: { value: true, error: "New label is required" } });
  });

  it("tracks a rename through the base message when it matches the base label", () => {
    // components/email ships "Email address is required" against the label
    // "Email address" — it reads as derived, so a rename should carry it.
    expect(
      syncRequiredMessageToLabel({
        ...args,
        baseValidations: {
          required: { value: true, error: "Email address is required" },
        },
        defaultRequired: true,
        previousLabel: "Email address",
        nextLabel: "Work email address",
      }),
    ).toEqual({
      required: { value: true, error: "Work email address is required" },
    });
  });

  it("leaves crafted copy alone", () => {
    const validations = {
      required: { value: true, error: "Enter your employer's name" },
    };
    expect(syncRequiredMessageToLabel({ ...args, validations })).toBe(
      validations,
    );
  });

  it("leaves an inherited message alone when it doesn't read as derived", () => {
    const baseValidations = {
      required: { value: true, error: "Enter your date of birth" },
    };
    expect(
      syncRequiredMessageToLabel({
        ...args,
        baseValidations,
        defaultRequired: true,
      }),
    ).toBeUndefined();
  });

  it("does nothing when the field isn't required", () => {
    expect(syncRequiredMessageToLabel({ ...args })).toBeUndefined();
  });

  it("does nothing when the field is explicitly un-required", () => {
    const validations = { required: { value: false } };
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations,
        defaultRequired: true,
      }),
    ).toBe(validations);
  });

  it("does nothing when there is no label to derive from", () => {
    const validations = { required: { value: true } };
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations,
        nextLabel: undefined,
      }),
    ).toBe(validations);
  });

  it("keeps the field's other rules", () => {
    expect(
      syncRequiredMessageToLabel({
        ...args,
        validations: {
          required: { value: true },
          minLength: { value: 2, error: "Too short" },
        },
      }),
    ).toEqual({
      required: { value: true, error: "New label is required" },
      minLength: { value: 2, error: "Too short" },
    });
  });
});
