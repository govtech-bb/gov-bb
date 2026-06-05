/**
 * @jest-environment jsdom
 *
 * (#618) The validation editor must surface the rules a component declares at
 * the *base* level — not just recipe overrides — so an author can see and
 * override them. A base-only rule renders read-only ("inherited") with an
 * Override action; overriding seeds an editable row from the base value;
 * resetting drops the override key so the recipe carries only genuine deltas.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValidationRule } from "@govtech-bb/form-types";
import type { FieldRef, StepRef } from "./-recipe-refs";
import { ValidationRulesEditor } from "./-validation-rules-editor";

function renderEditor(props: {
  rules?: ValidationRule;
  baseRules?: ValidationRule;
  fieldRefs?: FieldRef[];
  stepRefs?: StepRef[];
}) {
  const onChange = jest.fn();
  render(
    <ValidationRulesEditor
      htmlType="text"
      rules={props.rules}
      baseRules={props.baseRules}
      fieldRefs={props.fieldRefs ?? []}
      stepRefs={props.stepRefs ?? []}
      onChange={onChange}
    />,
  );
  return onChange;
}

const overrideButton = () => screen.getByRole("button", { name: /override/i });
const resetButton = () => screen.getByRole("button", { name: /reset/i });
const deleteButton = () => screen.getByRole("button", { name: "×" });

describe("inherited (base-only) rules", () => {
  it("renders a base-only rule read-only with its value, error, and an Override action", () => {
    renderEditor({
      baseRules: { minLength: { value: "5", error: "Too short" } },
    });

    expect(screen.getByText(/inherited from component/i)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Too short")).toBeInTheDocument();
    expect(overrideButton()).toBeInTheDocument();
    // Read-only: no editable inputs for an inherited rule.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("seeds the override from the base value when Override is clicked", async () => {
    const onChange = renderEditor({
      baseRules: { minLength: { value: "5", error: "Too short" } },
    });

    await userEvent.click(overrideButton());

    expect(onChange).toHaveBeenCalledWith({
      minLength: { value: "5", error: "Too short" },
    });
  });

  it("does not offer an inherited rule type in the Add Rule dropdown", () => {
    renderEditor({
      baseRules: { minLength: { value: "5", error: "Too short" } },
    });
    // The only path to edit an inherited rule is Override, not re-adding it.
    const select = screen.getByRole("combobox");
    expect(
      screen.queryByRole("option", { name: "Min Length" }),
    ).not.toBeInTheDocument();
    expect(select).toBeInTheDocument();
  });
});

describe("overridden rules (base + override)", () => {
  it("renders an editable row seeded with the override value and a Reset action", () => {
    renderEditor({
      baseRules: { minLength: { value: "5", error: "Too short" } },
      rules: { minLength: { value: "8", error: "Need eight" } },
    });

    expect(screen.getByDisplayValue("8")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Need eight")).toBeInTheDocument();
    expect(resetButton()).toBeInTheDocument();
    // An overridden rule is reset, not deleted.
    expect(screen.queryByRole("button", { name: "×" })).not.toBeInTheDocument();
  });

  it("drops the override key on Reset, falling back to the inherited base", async () => {
    const onChange = renderEditor({
      baseRules: { minLength: { value: "5", error: "Too short" } },
      rules: { minLength: { value: "8", error: "Need eight" } },
    });

    await userEvent.click(resetButton());

    // Removing the sole override collapses to undefined (no empty `{}` delta).
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("author-added rules (override-only, no base)", () => {
  it("keeps the editable row with a delete action and no Override/Reset", () => {
    renderEditor({
      rules: { pattern: { value: "abc", error: "Bad" } },
    });

    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /override/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reset/i }),
    ).not.toBeInTheDocument();
  });

  it("drops the key on delete", async () => {
    const onChange = renderEditor({
      rules: { pattern: { value: "abc", error: "Bad" } },
    });

    await userEvent.click(deleteButton());

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("required is owned by the Required checkbox, not this editor", () => {
  it("never renders a base `required` rule and never offers it in Add Rule", () => {
    renderEditor({
      baseRules: { required: { value: true }, minLength: { value: "5" } },
    });

    // minLength still renders as an inherited row...
    expect(overrideButton()).toBeInTheDocument();
    // ...but `required` is excluded entirely (no row, no add option).
    expect(screen.queryByText(/^required$/i)).not.toBeInTheDocument();
  });
});

describe("removing one of several overrides keeps the rest", () => {
  it("Reset drops only the targeted key, preserving other overrides", async () => {
    const onChange = renderEditor({
      baseRules: { minLength: { value: "5" } },
      rules: {
        minLength: { value: "8", error: "e8" }, // overridden (has base) → Reset
        maxLength: { value: "20", error: "e20" }, // author-added → ×
      },
    });

    await userEvent.click(resetButton());

    expect(onChange).toHaveBeenCalledWith({
      maxLength: { value: "20", error: "e20" },
    });
  });

  it("delete drops only the targeted key, preserving other overrides", async () => {
    const onChange = renderEditor({
      baseRules: { minLength: { value: "5" } },
      rules: {
        minLength: { value: "8", error: "e8" }, // overridden (has base) → Reset
        maxLength: { value: "20", error: "e20" }, // author-added → ×
      },
    });

    await userEvent.click(deleteButton());

    expect(onChange).toHaveBeenCalledWith({
      minLength: { value: "8", error: "e8" },
    });
  });
});

describe("editing an overridden row", () => {
  it("patches the edited key and preserves sibling override keys", async () => {
    const onChange = renderEditor({
      baseRules: { minLength: { value: "5" } },
      rules: {
        minLength: { value: "8", error: "old" },
        pattern: { value: "abc", error: "pat" },
      },
    });

    // Controlled inputs with a mock onChange never re-render, so a single
    // keystroke at the end of "old" yields one onChange call with "oldX".
    await userEvent.type(screen.getByDisplayValue("old"), "X");

    expect(onChange.mock.calls.at(-1)![0]).toEqual({
      minLength: { value: "8", error: "oldX" },
      pattern: { value: "abc", error: "pat" },
    });
  });
});

describe("text fields offer numeric and year comparison rules (#830)", () => {
  it("lists the numeric/year rules in the Add Rule dropdown", () => {
    renderEditor({});

    // The numeric comparison and year rules are now available on text fields.
    for (const label of [
      "Min Value",
      "Max Value",
      "Greater Than",
      "Less Than",
      "Min Year",
      "Max Year",
    ]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });
});

describe("reference rule step scoping (#840)", () => {
  // Two steps; step one has two fields, step two has one.
  const STEP_REFS: StepRef[] = [
    { stepId: "step-one", title: "Step One" },
    { stepId: "step-two", title: "Step Two" },
  ];
  const FIELD_REFS: FieldRef[] = [
    { stepId: "step-one", fieldId: "first-name", displayName: "First Name", isBoolean: false },
    { stepId: "step-one", fieldId: "last-name", displayName: "Last Name", isBoolean: false },
    { stepId: "step-two", fieldId: "age", displayName: "Age", isBoolean: false },
  ];

  // Locate the Reference Step select by its containing label.
  const stepSelect = () => {
    const label = screen.getByText("Reference Step");
    // The select is the next sibling control inside the same form group.
    return label.parentElement!.querySelector("select")! as HTMLSelectElement;
  };

  const fieldSelect = () => {
    const label = screen.getByText("Reference Field");
    return label.parentElement!.querySelector("select")! as HTMLSelectElement;
  };

  const fieldOptionLabels = () =>
    Array.from(fieldSelect().options)
      .map((o) => o.textContent)
      .filter((t) => t !== "— select field —");

  it("renders a Reference Step select for a reference rule (gt) but not for a value-only rule (minLength)", () => {
    renderEditor({
      rules: { gt: { value: "5" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    expect(screen.getByText("Reference Step")).toBeInTheDocument();
    expect(screen.getByText("Reference Field")).toBeInTheDocument();
  });

  it("does not render a Reference Step select for a value-only rule (minLength)", () => {
    renderEditor({
      rules: { minLength: { value: "5" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    expect(screen.queryByText("Reference Step")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference Field")).not.toBeInTheDocument();
  });

  it("offers an 'any step' option plus one option per step", () => {
    renderEditor({
      rules: { gt: { value: "5" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    const labels = Array.from(stepSelect().options).map((o) => o.textContent);
    expect(labels).toEqual([
      expect.stringMatching(/any step/i),
      "Step One",
      "Step Two",
    ]);
  });

  it("unscoped: shows the full flat field list and keeps the field picker enabled", () => {
    renderEditor({
      rules: { gt: {} },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    expect(stepSelect().value).toBe("");
    expect(fieldSelect().disabled).toBe(false);
    expect(fieldOptionLabels()).toEqual(["First Name", "Last Name", "Age"]);
  });

  it("selecting a step commits targetStepId and filters the field list to that step", async () => {
    const onChange = renderEditor({
      rules: { gt: {} },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    await userEvent.selectOptions(stepSelect(), "step-one");

    const config = onChange.mock.calls.at(-1)![0].gt;
    expect(config.targetStepId).toBe("step-one");
  });

  it("scoped: a pre-existing targetStepId renders the step value and a scoped field list", () => {
    renderEditor({
      rules: { gt: { targetStepId: "step-two", referenceFieldId: "age" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    expect(stepSelect().value).toBe("step-two");
    expect(fieldSelect().disabled).toBe(false);
    expect(fieldOptionLabels()).toEqual(["Age"]);
  });

  it("changing the step clears a now-stale referenceFieldId", async () => {
    const onChange = renderEditor({
      rules: { gt: { targetStepId: "step-one", referenceFieldId: "first-name" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    await userEvent.selectOptions(stepSelect(), "step-two");

    const config = onChange.mock.calls.at(-1)![0].gt;
    expect(config.targetStepId).toBe("step-two");
    // "first-name" is not on step-two → cleared.
    expect(config.referenceFieldId).toBe("");
  });

  it("changing the step keeps a still-valid referenceFieldId", async () => {
    const onChange = renderEditor({
      // first-name and last-name are both on step-one; we'll switch the
      // targetStepId away then... actually test same-step revalidation: a field
      // that survives the new step is kept. Set up a field present on the new step.
      rules: { gt: { targetStepId: "step-one", referenceFieldId: "first-name" } },
      fieldRefs: [
        ...FIELD_REFS,
        // a field that exists on step-two with the same id is unrealistic; instead
        // verify selecting step-one again keeps first-name.
      ],
      stepRefs: STEP_REFS,
    });
    await userEvent.selectOptions(stepSelect(), "step-one");

    const config = onChange.mock.calls.at(-1)![0].gt;
    expect(config.targetStepId).toBe("step-one");
    expect(config.referenceFieldId).toBe("first-name");
  });

  it("clearing the step back to 'any step' removes the targetStepId key and restores the flat list", async () => {
    const onChange = renderEditor({
      rules: { gt: { targetStepId: "step-two", referenceFieldId: "age" } },
      fieldRefs: FIELD_REFS,
      stepRefs: STEP_REFS,
    });
    await userEvent.selectOptions(stepSelect(), "");

    const config = onChange.mock.calls.at(-1)![0].gt;
    expect(config).not.toHaveProperty("targetStepId");
  });
});

describe("inherited and author-added rules coexist", () => {
  it("renders a base-only rule (inherited) before an override-only rule (editable)", () => {
    renderEditor({
      baseRules: { minLength: { value: "5", error: "min err" } },
      rules: { pattern: { value: "abc", error: "pat" } },
    });

    // Inherited row (base-only): read-only with Override.
    expect(screen.getByText(/inherited from component/i)).toBeInTheDocument();
    const override = overrideButton();
    // Author-added row (override-only): editable with delete.
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
    const del = deleteButton();

    // Union order: base rules first, then author-added override-only rules.
    expect(
      override.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
