/**
 * @jest-environment jsdom
 *
 * #566: in the step editor, the Step Behaviours section renders directly above
 * the "Add field" picker — i.e. between the Fields list and the picker.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import { StepEditor } from "./-step-editor";

const CATALOG: RegistryCatalog = { components: [], blocks: [], custom: [] };

function makeStep(overrides: Partial<RecipeStepDraft> = {}): RecipeStepDraft {
  return {
    stepId: "step-1",
    title: "Step One",
    fields: [],
    behaviours: [],
    ...overrides,
  };
}

function renderEditor(step: RecipeStepDraft) {
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  return render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={jest.fn()}
      catalog={CATALOG}
      onStepIdChange={jest.fn()}
    />,
  );
}

// The section headers all share the `.sectionTitle` class (identity-obj-proxy
// echoes it in tests), so their text in document order is the section order.
function sectionOrder(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".sectionTitle")).map(
    (el) => el.textContent,
  );
}

it("renders Step Behaviours directly above the Add field picker", () => {
  const { container } = renderEditor(makeStep());
  expect(sectionOrder(container)).toEqual([
    "Step Metadata",
    "Fields (0)",
    "Step Behaviours",
    "Add field",
  ]);
});

it("omits Fields and Add field for a no-fields step, leaving Step Behaviours", () => {
  const { container } = renderEditor(
    makeStep({ stepId: "check-your-answers", title: "Check your answers" }),
  );
  expect(sectionOrder(container)).toEqual([
    "Step Metadata",
    "Step Behaviours",
  ]);
});

// #1292: the submission-confirmation step renders recipe-authored markdown
// ("What happens next") on the confirmation page, so the editor exposes a
// markdown field for it — and only for it.
it("shows the Confirmation page content editor on the submission-confirmation step", () => {
  const { container } = renderEditor(
    makeStep({
      stepId: "submission-confirmation",
      title: "Application submitted",
    }),
  );
  expect(sectionOrder(container)).toEqual([
    "Step Metadata",
    "Confirmation page content",
    "Step Behaviours",
  ]);
});

it("does not show the Confirmation page content editor on a normal step", () => {
  const { container } = renderEditor(makeStep());
  expect(sectionOrder(container)).not.toContain("Confirmation page content");
});

it("dispatches markdownContent edits via UPDATE_STEP_META (#1292)", () => {
  const step = makeStep({
    stepId: "submission-confirmation",
    title: "Application submitted",
  });
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const dispatch = jest.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={jest.fn()}
    />,
  );
  const textarea = screen.getByLabelText('"What happens next" (markdown)');
  fireEvent.change(textarea, { target: { value: "## Next\n\n- step" } });
  expect(dispatch).toHaveBeenCalledWith({
    type: "UPDATE_STEP_META",
    stepId: "submission-confirmation",
    meta: { markdownContent: "## Next\n\n- step" },
  });
});

// Clearing the field collapses to `undefined` (the meta omits the key) so the
// serializer drops it rather than persisting an empty string.
it("clears markdownContent to undefined when emptied (#1292)", () => {
  const step = makeStep({
    stepId: "submission-confirmation",
    title: "Application submitted",
    markdownContent: "## old",
  });
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const dispatch = jest.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={jest.fn()}
    />,
  );
  const textarea = screen.getByLabelText('"What happens next" (markdown)');
  fireEvent.change(textarea, { target: { value: "" } });
  expect(dispatch).toHaveBeenCalledWith({
    type: "UPDATE_STEP_META",
    stepId: "submission-confirmation",
    meta: { markdownContent: undefined },
  });
});

// #546: dnd-kit's id generator uses a module-global counter (not React's
// useId), so its draggable `aria-describedby` ("DndDescribedBy-N") can differ
// between server and client renders → a hydration mismatch. Passing a stable
// `id` to the DndContext hits dnd-kit's escape hatch and pins the value, so the
// draggable rows describe-by a deterministic id rather than a counter.
it("pins a stable dnd-kit id so draggable aria-describedby is deterministic", () => {
  const { container } = renderEditor(
    makeStep({
      fields: [
        { id: "field-1", kind: "component", ref: "components/first-name", overrides: {} },
      ],
    }),
  );
  const handle = container.querySelector("[aria-describedby]");
  expect(handle).not.toBeNull();
  expect(handle).toHaveAttribute("aria-describedby", "step-fields-dnd");
});

// #741: the Step ID input kebabizes on blur, mirroring the Field ID Override
// input, so a typed `step_one` is auto-corrected instead of only erroring at
// validate time (the shared schemas now reject non-kebab ids).
it("kebabizes the Step ID on blur and commits the normalized id", () => {
  const step = makeStep();
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const dispatch = jest.fn();
  const onStepIdChange = jest.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={onStepIdChange}
    />,
  );
  // The label is a sibling of the input (no htmlFor), so locate via the group.
  const input = screen
    .getByText("Step ID")
    .parentElement!.querySelector("input")!;
  fireEvent.change(input, { target: { value: "step_one" } });
  expect(dispatch).not.toHaveBeenCalled(); // invalid id is not committed
  fireEvent.blur(input);
  expect(dispatch).toHaveBeenCalledWith({
    type: "UPDATE_STEP_META",
    stepId: "step-1",
    meta: { stepId: "step-one" },
  });
  expect(onStepIdChange).toHaveBeenCalledWith("step-1", "step-one");
});

// #792: the step editor passes its own stepId to the Step Behaviours editor,
// so a sharedFields behaviour's checkbox list offers this step's fields.
it("renders this step's fields as Shared Fields checkboxes", () => {
  const catalog: RegistryCatalog = {
    components: [
      {
        ref: "components/first-name",
        displayName: "First Name",
        primitive: { fieldId: "first-name", htmlType: "text" },
      } as unknown as RegistryCatalog["components"][number],
    ],
    blocks: [],
    custom: [],
  };
  const step = makeStep({
    fields: [
      { id: "field-1", kind: "component", ref: "components/first-name", overrides: {} },
    ],
    behaviours: [
      { type: "sharedFields", fieldIds: [] } as unknown as RecipeStepDraft["behaviours"][number],
    ],
  });
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={jest.fn()}
      catalog={catalog}
      onStepIdChange={jest.fn()}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "First Name" })).toBeInTheDocument();
});
