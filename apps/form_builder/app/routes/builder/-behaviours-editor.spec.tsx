/**
 * @jest-environment jsdom
 *
 * #519: the conditional Target Field picker is gated on and scoped to the
 * selected Target Step, keyed by resolved field id.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
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
  { stepId: "step-2", fieldId: "email", displayName: "Email", isBoolean: false },
];

function targetFieldSelect() {
  // The Target Field picker is the only select whose placeholder is "select field".
  return screen
    .getAllByRole("combobox")
    .find((el) =>
      within(el).queryByRole("option", { name: /select field/i }),
    ) as HTMLSelectElement;
}

function targetStepSelect() {
  return screen
    .getAllByRole("combobox")
    .find((el) =>
      within(el).queryByRole("option", { name: /select step/i }),
    ) as HTMLSelectElement;
}

function renderStepBehaviour(behaviours: Behaviour[], onChange = jest.fn()) {
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

it("disables the Target Field picker until a Target Step is chosen", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  expect(targetFieldSelect()).toBeDisabled();
});

it("enables the Target Field picker once a Target Step is set", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  expect(targetFieldSelect()).toBeEnabled();
});

it("limits Target Field options to fields in the selected Target Step", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  const options = within(targetFieldSelect())
    .getAllByRole("option")
    .map((o) => o.textContent);
  expect(options).toEqual([
    "— select field —",
    "First Name",
    "Last Name",
    "Agree",
  ]);
});

it("uses the resolved field id as the option value", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  const firstName = within(targetFieldSelect()).getByRole("option", {
    name: "First Name",
  }) as HTMLOptionElement;
  expect(firstName.value).toBe("first-name");
});

it("clears an incompatible Target Field when the Target Step changes", async () => {
  const onChange = renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "first-name", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  await userEvent.selectOptions(targetStepSelect(), "step-2");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetStepId: "step-2", targetFieldId: "" }),
  ]);
});

it("keeps the Target Field when the new step still contains it", async () => {
  // A field id that exists in both steps must survive the step change.
  const refs: FieldRef[] = [
    { stepId: "step-1", fieldId: "shared", displayName: "Shared", isBoolean: false },
    { stepId: "step-2", fieldId: "shared", displayName: "Shared", isBoolean: false },
  ];
  const onChange = jest.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "shared", operator: "equal", value: "" } as unknown as Behaviour,
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  await userEvent.selectOptions(targetStepSelect(), "step-2");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetStepId: "step-2", targetFieldId: "shared" }),
  ]);
});

it("renders distinct options for two fields in a step that resolve to the same id", () => {
  // Open question in the plan: two same-type components in one step resolve to
  // the same fieldId. The picker must still render both without a duplicate
  // React key crashing the render (keys are stepId:fieldId:index).
  const refs: FieldRef[] = [
    { stepId: "step-1", fieldId: "text", displayName: "Text", isBoolean: false },
    { stepId: "step-1", fieldId: "text", displayName: "Text", isBoolean: false },
  ];
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[
        { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "", operator: "equal", value: "" } as unknown as Behaviour,
      ]}
      fieldRefs={refs}
      stepRefs={STEP_REFS}
      onChange={jest.fn()}
    />,
  );
  // Placeholder + two duplicate-id options, all rendered (no key collision).
  expect(within(targetFieldSelect()).getAllByRole("option")).toHaveLength(3);
});

it("defaults a new fieldConditionalOn's Target Step to currentStepId", async () => {
  const onChange = jest.fn();
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
  await userEvent.selectOptions(
    screen.getByRole("combobox"),
    "fieldConditionalOn",
  );
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ type: "fieldConditionalOn", targetStepId: "step-2" }),
  ]);
});

// #565: a boolean Target Field (checkbox / show-hide) captures the condition
// value as a real boolean via a true/false control, not a string.

// The value control for a boolean target is the only select offering "true".
function valueBooleanSelect() {
  return screen
    .getAllByRole("combobox")
    .find((el) => within(el).queryByRole("option", { name: "true" })) as
    | HTMLSelectElement
    | undefined;
}

it("renders a true/false select for a boolean Target Field", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "agree", operator: "equal", value: true } as unknown as Behaviour,
  ]);
  const select = valueBooleanSelect();
  expect(select).toBeDefined();
  expect(
    within(select as HTMLSelectElement)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["true", "false"]);
  // No free-text value input is offered for a boolean target.
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("stores a real boolean when the true/false control changes", async () => {
  const onChange = renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "agree", operator: "equal", value: true } as unknown as Behaviour,
  ]);
  await userEvent.selectOptions(valueBooleanSelect() as HTMLSelectElement, "false");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ value: false }),
  ]);
});

it("renders a text input for a non-boolean Target Field", () => {
  renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "first-name", operator: "equal", value: "" } as unknown as Behaviour,
  ]);
  expect(valueBooleanSelect()).toBeUndefined();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

it("resets the value to true when the Target Field switches to boolean", async () => {
  const onChange = renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "first-name", operator: "equal", value: "hello" } as unknown as Behaviour,
  ]);
  await userEvent.selectOptions(targetFieldSelect(), "agree");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetFieldId: "agree", value: true }),
  ]);
});

it("resets the value to an empty string when the Target Field switches to non-boolean", async () => {
  const onChange = renderStepBehaviour([
    { type: "stepConditionalOn", targetStepId: "step-1", targetFieldId: "agree", operator: "equal", value: true } as unknown as Behaviour,
  ]);
  await userEvent.selectOptions(targetFieldSelect(), "first-name");
  expect(onChange).toHaveBeenLastCalledWith([
    expect.objectContaining({ targetFieldId: "first-name", value: "" }),
  ]);
});

// #768: repeatable exposes an optional "Add another label" text param that
// overrides the runtime's auto-generated "Add another?" radio label. Blank
// means absent — the editor must never store "".

it("renders a text input for repeatable's Add another label with the default as placeholder", () => {
  renderStepBehaviour([
    { type: "repeatable", min: 1, max: 5 } as unknown as Behaviour,
  ]);
  const input = screen.getByPlaceholderText("Add another?");
  expect(input).toBeInTheDocument();
  expect(input).toHaveValue("");
});

it("shows the stored addAnotherLabel value", () => {
  renderStepBehaviour([
    {
      type: "repeatable",
      min: 1,
      max: 5,
      addAnotherLabel: "Add another qualification?",
    } as unknown as Behaviour,
  ]);
  expect(screen.getByPlaceholderText("Add another?")).toHaveValue(
    "Add another qualification?",
  );
});

it("does not initialize addAnotherLabel when adding a repeatable behaviour", async () => {
  const onChange = jest.fn();
  render(
    <BehavioursEditor
      scope="step"
      behaviours={[]}
      fieldRefs={FIELD_REFS}
      stepRefs={STEP_REFS}
      onChange={onChange}
    />,
  );
  await userEvent.selectOptions(screen.getByRole("combobox"), "repeatable");
  const added = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect(added.type).toBe("repeatable");
  expect("addAnotherLabel" in added).toBe(false);
});

it("stores typed text as addAnotherLabel", async () => {
  const onChange = renderStepBehaviour([
    { type: "repeatable", min: 1, max: 5 } as unknown as Behaviour,
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
    } as unknown as Behaviour,
  ]);
  await userEvent.clear(screen.getByPlaceholderText("Add another?"));
  const updated = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect("addAnotherLabel" in updated).toBe(false);
});

it("treats whitespace-only input as blank", async () => {
  const onChange = renderStepBehaviour([
    { type: "repeatable", min: 1, max: 5 } as unknown as Behaviour,
  ]);
  await userEvent.type(screen.getByPlaceholderText("Add another?"), " ");
  const updated = onChange.mock.lastCall?.[0][0] as Record<string, unknown>;
  expect("addAnotherLabel" in updated).toBe(false);
});
