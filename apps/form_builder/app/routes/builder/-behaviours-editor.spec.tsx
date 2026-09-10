import { openSelect, chooseOption } from "../../test/select";
/**
 * @vitest-environment jsdom
 *
 * #519: the conditional Target Field picker is gated on and scoped to the
 * selected Target Step, keyed by resolved field id.
 */
import "@testing-library/jest-dom";
import { useState } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Behaviour } from "@govtech-bb/form-types";
import { BehavioursEditor } from "./-behaviours-editor";
import type { FieldRef, StepRef } from "./-recipe-refs";

const STEP_REFS: StepRef[] = [
  { stepId: "step-1", title: "Step One" },
  { stepId: "step-2", title: "Step Two" },
];

const FIELD_REFS: FieldRef[] = [
  {
    stepId: "step-1",
    fieldId: "first-name",
    displayName: "First Name",
    isBoolean: false,
  },
  {
    stepId: "step-1",
    fieldId: "last-name",
    displayName: "Last Name",
    isBoolean: false,
  },
  {
    stepId: "step-1",
    fieldId: "agree",
    displayName: "Agree",
    isBoolean: true,
  },
  {
    stepId: "step-2",
    fieldId: "email",
    displayName: "Email",
    isBoolean: false,
  },
];

function targetFieldSelect() {
  return screen.getByRole("combobox", { name: "Target Field" });
}

function targetStepSelect() {
  return screen.getByRole("combobox", { name: "Target Step" });
}

function renderStepBehaviour(behaviours: Behaviour[], onChange = vi.fn()) {
  render(
    <BehavioursEditor
      scope="step"
      behaviours={behaviours}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  return onChange;
}

it("disables the Target Field picker until a Target Step is chosen", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "",
      targetFieldId: "",
      operator: "equal",
      value: "",
    },
  ]);
  expect(targetFieldSelect()).toBeDisabled();
});

it("enables the Target Field picker once a Target Step is set", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "",
      operator: "equal",
      value: "",
    },
  ]);
  expect(targetFieldSelect()).toBeEnabled();
});

it("limits Target Field options to fields in the selected Target Step", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "",
      operator: "equal",
      value: "",
    },
  ]);
  const options = within(await openSelect(targetFieldSelect()))
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(options).toEqual([
    "— select field —",
    "First Name",
    "Last Name",
    "Agree",
  ]);
});

it("uses the resolved field id as the option value", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "",
      operator: "equal",
      value: "",
    },
  ]);
  const firstName = within(await openSelect(targetFieldSelect())).getByRole(
    "option",
    {
      name: "First Name",
    },
  ) as HTMLOptionElement;
  await userEvent.click(firstName);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetFieldId: "first-name" }),
  ]);
});

it("clears an incompatible Target Field when the Target Step changes", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  await chooseOption(targetStepSelect(), "Step Two");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetStepId: "step-2", targetFieldId: "" }),
  ]);
});

it("keeps the Target Field when the new step still contains it", async () => {
  // A field id that exists in both steps must survive the step change.
  const refs: FieldRef[] = [
    {
      stepId: "step-1",
      fieldId: "shared",
      displayName: "Shared",
      isBoolean: false,
    },
    {
      stepId: "step-2",
      fieldId: "shared",
      displayName: "Shared",
      isBoolean: false,
    },
  ];
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        {
          type: "stepConditionalOn",
          targetStepId: "step-1",
          targetFieldId: "shared",
          operator: "equal",
          value: "",
        },
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  await chooseOption(targetStepSelect(), "Step Two");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      targetStepId: "step-2",
      targetFieldId: "shared",
    }),
  ]);
});

it("renders distinct options for two fields in a step that resolve to the same id", async () => {
  // Open question in the plan: two same-type components in one step resolve to
  // the same fieldId. The picker must still render both without a duplicate
  // React key crashing the render (keys are stepId:fieldId:index).
  const refs: FieldRef[] = [
    {
      stepId: "step-1",
      fieldId: "text",
      displayName: "Text",
      isBoolean: false,
    },
    {
      stepId: "step-1",
      fieldId: "text",
      displayName: "Text",
      isBoolean: false,
    },
  ];
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        {
          type: "stepConditionalOn",
          targetStepId: "step-1",
          targetFieldId: "",
          operator: "equal",
          value: "",
        },
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={vi.fn()}
    />,
  );
  // Placeholder + two duplicate-id options, all rendered (no key collision).
  expect(
    within(await openSelect(targetFieldSelect())).getAllByRole("option"),
  ).toHaveLength(3);
});

it("defaults a new fieldConditionalOn's Target Step to currentStepId", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-2"
    />,
  );
  await chooseOption(screen.getByRole("combobox"), "Field Conditional On");
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({
      type: "fieldConditionalOn",
      targetStepId: "step-2",
    }),
  ]);
});

// #565: a boolean Target Field (checkbox / show-hide) captures the condition
// value as a real boolean via a true/false control, not a string.

// The value control for a boolean target is the only select offering "true".
function valueBooleanSelect() {
  return screen.queryByRole("combobox", { name: "Value" }) ?? undefined;
}

it("renders a true/false select for a boolean Target Field", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "agree",
      operator: "equal",
      value: true,
    },
  ]);
  const select = valueBooleanSelect();
  expect(select).toBeDefined();
  expect(
    within(await openSelect(select as HTMLSelectElement))
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["true", "false"]);
  // No free-text value input is offered for a boolean target.
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("stores a real boolean when the true/false control changes", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "agree",
      operator: "equal",
      value: true,
    },
  ]);
  await chooseOption(valueBooleanSelect() as HTMLSelectElement, "false");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: false }),
  ]);
});

it("renders a text input for a non-boolean Target Field", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  expect(valueBooleanSelect()).toBeUndefined();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

it("resets the value to true when the Target Field switches to boolean", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "hello",
    },
  ]);
  await chooseOption(targetFieldSelect(), "Agree");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetFieldId: "agree", value: true }),
  ]);
});

it("resets the value to an empty string when the Target Field switches to non-boolean", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "agree",
      operator: "equal",
      value: true,
    },
  ]);
  await chooseOption(targetFieldSelect(), "First Name");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetFieldId: "first-name", value: "" }),
  ]);
});

// #769: optionalIf (relax `required` without hiding the field, #625) must be
// authorable from the field modal's behaviours editor.

function addBehaviourSelect() {
  return screen.getByRole("combobox", { name: "Add behaviour" });
}

it("offers Optional If in the Add Behaviour dropdown for field scope", async () => {
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={vi.fn()}
      currentStepId="step-1"
    />,
  );
  expect(
    within(await openSelect(addBehaviourSelect())).getByRole("option", {
      name: "Optional If",
    }),
  ).toBeInTheDocument();
});

it("does not offer Optional If for step scope", async () => {
  renderStepBehaviour([]);
  expect(
    within(await openSelect(addBehaviourSelect())).queryByRole("option", {
      name: "Optional If",
    }),
  ).not.toBeInTheDocument();
});

it("defaults a new optionalIf's Target Step to currentStepId", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-2"
    />,
  );
  await chooseOption(addBehaviourSelect(), "Optional If");
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({
      type: "optionalIf",
      targetStepId: "step-2",
      targetFieldId: "",
      operator: "equal",
      value: "",
    }),
  ]);
});

// #771: repeatable min/max defaults and clamped inputs

it("adding a repeatable behaviour initialises { min: 1, max: 5 }", async () => {
  const onChange = renderStepBehaviour([]);
  await chooseOption(addBehaviourSelect(), "Repeatable");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ type: "repeatable", min: 1, max: 5 }),
  ]);
});

it("the Min input for repeatable has min='1' and changing to 0 stores 1", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[{ type: "repeatable", min: 1, max: 5 }]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  const minInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement).closest("div")?.textContent?.includes("Min"),
    ) as HTMLInputElement;
  expect(minInput).toHaveAttribute("min", "1");
  // fireEvent.change sets the full value atomically on a controlled input
  fireEvent.change(minInput, { target: { value: "0" } });
  const lastCall = onChange.mock.calls[
    onChange.mock.calls.length - 1
  ][0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["min"]).toBe(1);
});

it("with min: 3, changing Max to 2 stores 3 (clamped to atLeastParam)", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[{ type: "repeatable", min: 3, max: 5 }]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  const maxInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement).closest("div")?.textContent?.includes("Max"),
    ) as HTMLInputElement;
  fireEvent.change(maxInput, { target: { value: "2" } });
  const lastCall = onChange.mock.calls[
    onChange.mock.calls.length - 1
  ][0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["max"]).toBe(3);
});

it("raising Min above current Max also raises Max (min: 7 with max: 5 stores { min: 7, max: 7 })", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[{ type: "repeatable", min: 3, max: 5 }]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  const minInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement).closest("div")?.textContent?.includes("Min"),
    ) as HTMLInputElement;
  fireEvent.change(minInput, { target: { value: "7" } });
  const lastCall = onChange.mock.calls[
    onChange.mock.calls.length - 1
  ][0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["min"]).toBe(7);
  expect((lastCall[0] as Record<string, unknown>)["max"]).toBe(7);
});

it("renders the gated step/field/operator/value controls for an optionalIf behaviour", async () => {
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[
        {
          type: "optionalIf",
          targetStepId: "step-1",
          targetFieldId: "agree",
          operator: "equal",
          value: true,
        },
      ]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={vi.fn()}
      currentStepId="step-1"
    />,
  );
  expect(screen.getByText("Optional If")).toBeInTheDocument();
  expect(targetStepSelect()).toBeInTheDocument();
  expect(targetFieldSelect()).toBeEnabled();
  // Boolean target (show-hide toggle) gets the true/false control. (#565)
  expect(valueBooleanSelect()).toBeInTheDocument();
});

// #768: repeatable exposes an optional "Add another label" text param that
// overrides the runtime's auto-generated "Add another?" radio label. Blank
// means absent — the editor must never store "".

it("renders a text input for repeatable's Add another label with the default as placeholder", async () => {
  renderStepBehaviour([{ type: "repeatable", min: 1, max: 5 }]);
  const input = screen.getByPlaceholderText("Add another?");
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue("");
});

it("shows the stored addAnotherLabel value", async () => {
  renderStepBehaviour([
    {
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "Add another qualification?",
    },
  ]);
  expect(screen.getByPlaceholderText("Add another?")).toHaveValue(
    "Add another qualification?",
  );
});

it("does not initialize addAnotherLabel when adding a repeatable behaviour", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  await chooseOption(screen.getByRole("combobox"), "Repeatable");
  const added = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect(added.type).toBe("repeatable");
  expect("addAnotherLabel" in added).toBe(false);
});

it("stores typed text as addAnotherLabel", async () => {
  const onChange = renderStepBehaviour([
    { type: "repeatable", min: 1, max: 5 },
  ]);
  await userEvent.type(screen.getByPlaceholderText("Add another?"), "A");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ addAnotherLabel: "A" }),
  ]);
});

it("deletes addAnotherLabel from the behaviour when the input is blanked", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "X",
    },
  ]);
  await userEvent.clear(screen.getByPlaceholderText("Add another?"));
  const updated = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect("addAnotherLabel" in updated).toBe(false);
});

it("treats whitespace-only input as blank", async () => {
  const onChange = renderStepBehaviour([
    { type: "repeatable", min: 1, max: 5 },
  ]);
  await userEvent.type(screen.getByPlaceholderText("Add another?"), " ");
  const updated = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect("addAnotherLabel" in updated).toBe(false);
});

// #792: sharedFields.fieldIds is picked from a checkbox list of the current
// step's fields (fieldRefArray kind) instead of a free-typed comma-separated
// text input, so authors can't typo a field id into a recipe.

function renderSharedFields(
  fieldIds: string[],
  onChange = vi.fn(),
  { refs = FIELD_REFS, currentStepId = "step-1" as string | undefined } = {},
) {
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[{ type: "sharedFields", fieldIds }]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId={currentStepId}
    />,
  );
  return onChange;
}

it("renders a checkbox per current-step field and none for other steps' fields", async () => {
  renderSharedFields([]);
  expect(
    screen.getByRole("checkbox", { name: "First Name" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Last Name" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Agree" })).toBeInTheDocument();
  // step-2's field must not be offered.
  expect(
    screen.queryByRole("checkbox", { name: "Email" }),
  ).not.toBeInTheDocument();
  // The old comma-separated text input is gone.
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("checks exactly the boxes whose field ids are in fieldIds", async () => {
  renderSharedFields(["first-name"]);
  expect(screen.getByRole("checkbox", { name: "First Name" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Last Name" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Agree" })).not.toBeChecked();
});

it("checking a box adds its field id to fieldIds", async () => {
  const onChange = renderSharedFields(["first-name"]);
  await userEvent.click(screen.getByRole("checkbox", { name: "Last Name" }));
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ fieldIds: ["first-name", "last-name"] }),
  ]);
});

it("unchecking a box removes its field id from fieldIds", async () => {
  const onChange = renderSharedFields(["first-name", "last-name"]);
  await userEvent.click(screen.getByRole("checkbox", { name: "First Name" }));
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ fieldIds: ["last-name"] }),
  ]);
});

it("renders one checkbox for two same-step fields that resolve to the same id", async () => {
  // Two same-type components on one step resolve to the same runtime fieldId;
  // the list dedupes so the id is offered once.
  const refs: FieldRef[] = [
    {
      stepId: "step-1",
      fieldId: "text",
      displayName: "Text",
      isBoolean: false,
    },
    {
      stepId: "step-1",
      fieldId: "text",
      displayName: "Text",
      isBoolean: false,
    },
  ];
  renderSharedFields([], vi.fn(), { refs });
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
});

it("renders no checkbox for a stale id and drops it on the next toggle", async () => {
  // "ghost" matches no current field: nothing rendered for it, and the next
  // edit rebuilds fieldIds from real fields only (#792 silent-drop semantics).
  const onChange = renderSharedFields(["ghost", "first-name"]);
  expect(screen.getAllByRole("checkbox")).toHaveLength(3); // step-1 fields only
  await userEvent.click(screen.getByRole("checkbox", { name: "Last Name" }));
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ fieldIds: ["first-name", "last-name"] }),
  ]);
});

it("shows a hint instead of checkboxes when the step has no fields", async () => {
  renderSharedFields([], vi.fn(), { currentStepId: "step-9" });
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.getByText(/no fields/i)).toBeInTheDocument();
});

it("adding a Shared Fields behaviour seeds an empty fieldIds array", async () => {
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-1"
    />,
  );
  await chooseOption(addBehaviourSelect(), "Shared Fields");
  expect(onChange).toHaveBeenLastCalledWith([
    { type: "sharedFields", fieldIds: [] },
  ]);
});

it("step-scope stepConditionalOn still seeds an empty Target Step when currentStepId is passed", async () => {
  // The step editor now passes currentStepId for the checkbox list; the
  // stepRef seeding must stay field-scope-only so the Target Step doesn't
  // default to the step itself (#519 gating unchanged).
  const onChange = vi.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-1"
    />,
  );
  await chooseOption(addBehaviourSelect(), "Step Conditional On");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ type: "stepConditionalOn", targetStepId: "" }),
  ]);
});

// ─── numeric operators + duration transform (#1020) ──────────────────────────

function operatorSelect() {
  return screen.queryByRole("combobox", { name: "Operator" }) ?? undefined;
}

function transformSelect() {
  return screen.queryByRole("combobox", { name: "Transform" }) ?? undefined;
}

it("offers the numeric comparison operators (gte/lte/gt/lt)", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  const values = within(await openSelect(operatorSelect()!))
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(values).toEqual(expect.arrayContaining(["gte", "lte", "gt", "lt"]));
});

it("shows a duration transform selector once a numeric operator is chosen", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "gte",
      value: "16",
    },
  ]);
  expect(transformSelect()).toBeDefined();
});

it("hides the transform selector for non-numeric operators", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  expect(transformSelect()).toBeUndefined();
});

it("writes the chosen transform onto the behaviour", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "gte",
      value: "16",
    },
  ]);
  await chooseOption(transformSelect()!, "yearsSince");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ transform: "yearsSince" }),
  ]);
});

it("clears a stale transform when the operator switches to a non-numeric one (#1020)", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "gte",
      value: "16",
      transform: "yearsSince",
    },
  ]);
  await chooseOption(operatorSelect()!, "equal");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.operator).toBe("equal");
  expect(next.transform).toBeUndefined();
});

it("keeps the transform when switching between numeric operators (#1020)", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "gte",
      value: "16",
      transform: "yearsSince",
    },
  ]);
  await chooseOption(operatorSelect()!, "lte");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.operator).toBe("lte");
  expect(next.transform).toBe("yearsSince");
});

// ─── `in` operator captures value as a string array (#1738) ───────────────────
// The `in` evaluator is array-only, so the value control must store a string[]
// (comma-separated entry) instead of the bare string every other operator uses.

const IN_HINT = "Enter multiple values separated by commas";

function inBehaviour(value: string[]): Behaviour {
  return {
    type: "stepConditionalOn",
    targetStepId: "step-1",
    targetFieldId: "first-name", // non-boolean target
    operator: "in",
    value,
  };
}

it("displays an array `in` value as a comma-separated string", async () => {
  renderStepBehaviour([inBehaviour(["a", "b"])]);
  expect(screen.getByRole("textbox")).toHaveValue("a, b");
});

it("commits a string array on blur for comma-separated values under `in`", async () => {
  const onChange = renderStepBehaviour([inBehaviour([])]);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "a, b" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: ["a", "b"] }),
  ]);
});

it("commits a single typed value as a one-element array on blur under `in`", async () => {
  const onChange = renderStepBehaviour([inBehaviour([])]);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "other" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: ["other"] }),
  ]);
});

it("trims entries and drops empties when committing the `in` value", async () => {
  const onChange = renderStepBehaviour([inBehaviour([])]);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "a, , b ," } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: ["a", "b"] }),
  ]);
});

it("commits an empty array when the `in` value input is blanked", async () => {
  const onChange = renderStepBehaviour([inBehaviour(["a"])]);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.blur(input);
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: [] }),
  ]);
});

it("shows the comma hint while `in` is selected", async () => {
  renderStepBehaviour([inBehaviour([])]);
  expect(screen.getByText(IN_HINT)).toBeInTheDocument();
});

it("does not show the comma hint for a non-`in` operator", async () => {
  renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  expect(screen.queryByText(IN_HINT)).not.toBeInTheDocument();
});

it("wraps an existing scalar value into an array when switching to `in`", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "other",
    },
  ]);
  await chooseOption(operatorSelect()!, "in");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.operator).toBe("in");
  expect(next.value).toEqual(["other"]);
});

it("wraps an empty scalar value into an empty array when switching to `in`", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "first-name",
      operator: "equal",
      value: "",
    },
  ]);
  await chooseOption(operatorSelect()!, "in");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.value).toEqual([]);
});

it("joins an array value back to a comma string when switching `in` → a scalar operator", async () => {
  const onChange = renderStepBehaviour([inBehaviour(["a", "b"])]);
  await chooseOption(operatorSelect()!, "equal");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.operator).toBe("equal");
  expect(next.value).toBe("a, b");
});

it("leaves a boolean target's value untouched when switching to `in`", async () => {
  const onChange = renderStepBehaviour([
    {
      type: "stepConditionalOn",
      targetStepId: "step-1",
      targetFieldId: "agree", // boolean target
      operator: "equal",
      value: true,
    },
  ]);
  await chooseOption(operatorSelect()!, "in");
  const next = onChange.mock.calls.at(-1)![0][0] as Record<string, unknown>;
  expect(next.operator).toBe("in");
  expect(next.value).toBe(true);
});

// The editor is controlled by its parent: onChange writes the parsed value back
// into `behaviours`, which re-renders the input. A naive parse-on-every-change
// that derives the input value from the stored array would strip a trailing
// comma, making it impossible to type a second value. Exercise the real
// round-trip with a re-rendering parent. (#1738)
function ControlledInEditor({
  initial,
  onChange,
}: {
  initial: Behaviour[];
  onChange?: (b: Behaviour[]) => void;
}) {
  const [behaviours, setBehaviours] = useState(initial);
  return (
    <BehavioursEditor
      scope="step"
      behaviours={behaviours}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={(next) => {
        setBehaviours(next);
        onChange?.(next);
      }}
    />
  );
}

it("keeps a trailing comma visible so a second value can be typed (#1738)", async () => {
  const onChange = vi.fn();
  render(
    <ControlledInEditor initial={[inBehaviour([])]} onChange={onChange} />,
  );
  const input = screen.getByRole("textbox");
  await userEvent.type(input, "abc, def");
  // The raw text survives keystroke-by-keystroke (no comma stripping)…
  expect(input).toHaveValue("abc, def");
  // …and the normalized array is committed on blur.
  await userEvent.tab();
  expect(onChange.mock.calls.at(-1)![0][0]).toEqual(
    expect.objectContaining({ value: ["abc", "def"] }),
  );
});

it("normalizes the displayed text from the committed array on blur (#1738)", async () => {
  // After blur the input re-seeds from the stored array (keyed on the value),
  // so a stray trailing comma/space cleans up to the canonical "a, b" form.
  render(<ControlledInEditor initial={[inBehaviour([])]} />);
  await userEvent.type(screen.getByRole("textbox"), "abc, def, ");
  await userEvent.tab();
  // Re-query: the value-keyed remount replaces the DOM node on commit.
  expect(screen.getByRole("textbox")).toHaveValue("abc, def");
});

// #2317: fieldArray ("Answer more than once") becomes a first-class authoring
// tool — safe defaults, min/max clamps, availability gated on the field types
// the runtime actually repeats, and an in-row "The applicant sees" miniature.

function renderFieldArrayEditor(
  behaviours: Behaviour[],
  onChange = vi.fn(),
  currentField: { label: string; htmlType: string } | undefined = {
    label: "Middle name",
    htmlType: "text",
  },
) {
  render(
    <BehavioursEditor
      scope="field"
      behaviours={behaviours}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
      currentStepId="step-1"
      currentField={currentField}
    />,
  );
  return onChange;
}

it("adding Answer more than once initialises { min: 1, max: 4 } with no addAnotherLabel", async () => {
  const onChange = renderFieldArrayEditor([]);
  await chooseOption(addBehaviourSelect(), "Answer more than once");
  const added = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect(added).toMatchObject({ type: "fieldArray", min: 1, max: 4 });
  expect("addAnotherLabel" in added).toBe(false);
});

it("the Start with input has min='1' and changing to 0 stores 1", async () => {
  const onChange = vi.fn();
  renderFieldArrayEditor([{ type: "fieldArray", min: 1, max: 4 }], onChange);
  const minInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement)
        .closest("div")
        ?.textContent?.includes("Start with"),
    ) as HTMLInputElement;
  expect(minInput).toHaveAttribute("min", "1");
  fireEvent.change(minInput, { target: { value: "0" } });
  const lastCall = onChange.mock.lastCall?.[0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["min"]).toBe(1);
});

it("with min: 3, lowering Allow up to to 2 stores 3 (clamped to Start with)", async () => {
  const onChange = vi.fn();
  renderFieldArrayEditor([{ type: "fieldArray", min: 3, max: 5 }], onChange);
  const maxInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement)
        .closest("div")
        ?.textContent?.includes("Allow up to"),
    ) as HTMLInputElement;
  fireEvent.change(maxInput, { target: { value: "2" } });
  const lastCall = onChange.mock.lastCall?.[0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["max"]).toBe(3);
});

it("raising Start with above Allow up to raises both", async () => {
  const onChange = vi.fn();
  renderFieldArrayEditor([{ type: "fieldArray", min: 2, max: 4 }], onChange);
  const minInput = screen
    .getAllByRole("spinbutton")
    .find((el) =>
      (el as HTMLInputElement)
        .closest("div")
        ?.textContent?.includes("Start with"),
    ) as HTMLInputElement;
  fireEvent.change(minInput, { target: { value: "6" } });
  const lastCall = onChange.mock.lastCall?.[0] as Behaviour[];
  expect((lastCall[0] as Record<string, unknown>)["min"]).toBe(6);
  expect((lastCall[0] as Record<string, unknown>)["max"]).toBe(6);
});

it("renders a text input for the Add another link text with the runtime default as placeholder", async () => {
  renderFieldArrayEditor([{ type: "fieldArray", min: 1, max: 4 }]);
  expect(screen.getByPlaceholderText("Add Another")).toBeInTheDocument();
});

it("disables Answer more than once for a select field, with a reason and a hint", async () => {
  renderFieldArrayEditor([], vi.fn(), {
    label: "Region",
    htmlType: "select",
  });
  const option = within(await openSelect(addBehaviourSelect())).getByRole(
    "option",
    {
      name: /Answer more than once — needs a text-like field/,
    },
  );
  expect(option).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByText(
      "Only text, number, phone, email, time and long-answer fields can be answered more than once.",
    ),
  ).toBeInTheDocument();
});

it("offers Answer more than once enabled (no hint) for a text field", async () => {
  renderFieldArrayEditor([]);
  const option = within(await openSelect(addBehaviourSelect())).getByRole(
    "option",
    {
      name: "Answer more than once",
    },
  );
  expect(option).not.toBeDisabled();
  expect(
    screen.queryByText(/can be answered more than once/),
  ).not.toBeInTheDocument();
});

it("miniature shows the field label, one box per Start with, and the default link text", async () => {
  renderFieldArrayEditor([{ type: "fieldArray", min: 2, max: 4 }]);
  expect(screen.getByText("The applicant sees")).toBeInTheDocument();
  expect(screen.getByText("Middle name")).toBeInTheDocument();
  expect(screen.getAllByTestId("fa-miniature-box")).toHaveLength(2);
  expect(screen.getByText("+ Add Another")).toBeInTheDocument();
});

it("miniature link line uses the typed addAnotherLabel", async () => {
  renderFieldArrayEditor([
    {
      type: "fieldArray",
      min: 1,
      max: 4,
      addAnotherLabel: "Add another middle name",
    },
  ]);
  expect(screen.getByText("+ Add another middle name")).toBeInTheDocument();
});

it("miniature hides the link line when min equals max", async () => {
  renderFieldArrayEditor([{ type: "fieldArray", min: 3, max: 3 }]);
  expect(screen.getAllByTestId("fa-miniature-box")).toHaveLength(3);
  expect(screen.queryByText("+ Add Another")).not.toBeInTheDocument();
});

it("renders no miniature without currentField", async () => {
  render(
    <BehavioursEditor
      scope="field"
      behaviours={[{ type: "fieldArray", min: 1, max: 4 }]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={vi.fn()}
      currentStepId="step-1"
    />,
  );
  expect(screen.queryByText("The applicant sees")).not.toBeInTheDocument();
});

it("miniature caps at 5 boxes and collapses the rest to an '…and N more' line", async () => {
  renderFieldArrayEditor([{ type: "fieldArray", min: 8, max: 10 }]);
  expect(screen.getAllByTestId("fa-miniature-box")).toHaveLength(5);
  expect(screen.getByText("…and 3 more")).toBeInTheDocument();
});
