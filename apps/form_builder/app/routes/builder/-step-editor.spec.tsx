/**
 * @jest-environment jsdom
 *
 * #566: in the step editor, the Step Behaviours section renders directly above
 * the "Add field" picker — i.e. between the Fields list and the picker.
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
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
