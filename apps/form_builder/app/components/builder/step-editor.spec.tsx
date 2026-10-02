/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within, waitFor } from "../../test/ui";
import userEvent from "@testing-library/user-event";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import { StepEditor } from "./step-editor";
import { useReducer } from "react";
import { recipeReducer } from "./recipe-reducer";
import { getCatalog } from "@govtech-bb/form-builder";

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

function renderEditor(step: RecipeStepDraft, dispatch = vi.fn()) {
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  return render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={vi.fn()}
    />,
  );
}

it("adds a question and opens its editor without losing the current page", async () => {
  const user = userEvent.setup();
  function Page() {
    const [draft, dispatch] = useReducer(recipeReducer, {
      formId: "f",
      title: "F",
      steps: [makeStep()],
    });
    return (
      <StepEditor
        step={draft.steps[0]}
        draft={draft}
        dispatch={dispatch}
        catalog={getCatalog()}
        onStepIdChange={vi.fn()}
      />
    );
  }
  render(<Page />);
  expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue(
    "Step One",
  );
  await user.click(screen.getAllByRole("button", { name: "Add question" })[0]);
  const picker = screen.getByRole("dialog", { name: "Add a question" });
  await user.click(within(picker).getByRole("button", { name: "Text" }));
  const editor = await screen.findByRole("dialog", { name: "Edit question" });
  await user.type(
    within(editor).getByRole("textbox", { name: "Label" }),
    "Reference number",
  );
  await user.click(within(editor).getByRole("button", { name: "Save" }));
  expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue(
    "Step One",
  );
  expect(
    screen.getByRole("button", { name: "Edit Reference number" }),
  ).toBeInTheDocument();
});

it("keeps managed review pages free of author-added questions", () => {
  renderEditor(
    makeStep({ stepId: "check-your-answers", title: "Check your answers" }),
  );
  expect(
    screen.queryByRole("button", { name: "Add question" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/People review their answers here/),
  ).toBeInTheDocument();
});

it("shows confirmation content by default after submission", () => {
  renderEditor(
    makeStep({
      stepId: "submission-confirmation",
      title: "Application submitted",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Confirmation page content" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.queryByRole("button", { name: "Add question" }),
  ).not.toBeInTheDocument();
});

it("keeps optional instructions and page logic in disclosures", () => {
  renderEditor(makeStep());
  expect(
    screen.getByRole("button", { name: "Instructions before the questions" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.getByRole("button", { name: "Page settings and logic" }),
  ).toHaveAttribute("aria-expanded", "false");
});

// The confirmation copy is edited through the content CMS's BodyEditor
// (visual + markdown tabs). The tests drive its markdown-source tab — the
// deterministic path in jsdom, where the visual tab's contenteditable +
// execCommand toolbar isn't faithfully implemented.
function openMarkdownTab(): HTMLTextAreaElement {
  fireEvent.click(screen.getByRole("tab", { name: "Markdown" }));
  return screen.getByPlaceholderText(
    "Write the page in markdown…",
  ) as HTMLTextAreaElement;
}

it("dispatches markdownContent edits via UPDATE_STEP_META (#1292)", () => {
  const step = makeStep({
    stepId: "submission-confirmation",
    title: "Application submitted",
  });
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const dispatch = vi.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={vi.fn()}
    />,
  );
  const textarea = openMarkdownTab();
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
  const dispatch = vi.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={vi.fn()}
    />,
  );
  const textarea = openMarkdownTab();
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
        {
          id: "field-1",
          kind: "component",
          ref: "components/first-name",
          overrides: {},
        },
      ],
    }),
  );
  const handle = container.querySelector('[aria-label^="Drag to reorder"]');
  expect(handle).not.toBeNull();
  expect(handle).toHaveAttribute("aria-describedby", "step-fields-dnd");
});

it("reorders fields from the keyboard grip and cancels with Escape", async () => {
  const user = userEvent.setup();
  const dispatch = vi.fn();
  renderEditor(
    makeStep({
      fields: ["first-name", "last-name"].map((name) => ({
        id: name,
        kind: "component",
        ref: `components/${name}`,
        overrides: {},
      })),
    }),
    dispatch,
  );
  const handles = screen.getAllByRole("button", { name: /^Drag to reorder/ });
  // jsdom has no layout; dnd-kit needs each row's bounds to find its neighbour.
  handles.forEach((handle, index) => {
    vi.spyOn(
      handle.closest("[data-field-row]")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, index * 50, 400, 44));
  });
  const handle = handles[0];
  expect(handle).toHaveAttribute("tabindex", "0");
  handle.focus();
  await user.keyboard("[Space]");
  await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
  await user.keyboard("[ArrowDown][Space]");
  expect(dispatch).toHaveBeenCalledWith({
    type: "REORDER_FIELDS",
    stepId: "step-1",
    fromIndex: 0,
    toIndex: 1,
  });
  expect(handle).toHaveFocus();

  dispatch.mockClear();
  await user.keyboard("[Space]");
  await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
  await user.keyboard("[ArrowDown][Escape]");
  expect(handle).not.toHaveAttribute("aria-pressed", "true");
  expect(dispatch).not.toHaveBeenCalled();
  expect(handle).toHaveFocus();
});

// #741: the Step ID input kebabizes on blur, mirroring the Field ID Override
// input, so a typed `step_one` is auto-corrected instead of only erroring at
// validate time (the shared schemas now reject non-kebab ids).
it("kebabizes the Step ID on blur and commits the normalized id", () => {
  const step = makeStep();
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const dispatch = vi.fn();
  const onStepIdChange = vi.fn();
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={dispatch}
      catalog={CATALOG}
      onStepIdChange={onStepIdChange}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Page settings and logic" }),
  );
  const input = screen.getByRole("textbox", { name: "Step ID" });
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
      {
        id: "field-1",
        kind: "component",
        ref: "components/first-name",
        overrides: {},
      },
    ],
    behaviours: [{ type: "sharedFields", fieldIds: [] }],
  });
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  render(
    <StepEditor
      step={step}
      draft={draft}
      dispatch={vi.fn()}
      catalog={catalog}
      onStepIdChange={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Page settings and logic" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "First Name" }),
  ).toBeInTheDocument();
});

it("toggles instructions from the keyboard while preserving the active editor and draft", async () => {
  const user = userEvent.setup();
  function Page() {
    const [draft, dispatch] = useReducer(recipeReducer, {
      formId: "f",
      title: "F",
      steps: [makeStep()],
    });
    return (
      <StepEditor
        step={draft.steps[0]}
        draft={draft}
        dispatch={dispatch}
        catalog={CATALOG}
        onStepIdChange={vi.fn()}
      />
    );
  }
  render(<Page />);
  const trigger = screen.getByRole("button", {
    name: "Instructions before the questions",
  });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const source = openMarkdownTab();
  fireEvent.change(source, { target: { value: "Bring your identification." } });
  trigger.focus();
  await user.keyboard(" ");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(source).toBeInTheDocument();
  expect(source).not.toBeVisible();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("textbox", { name: "step-1 step content" })).toBe(
    source,
  );
  expect(source).toHaveValue("Bring your identification.");
});

it("opens and focuses a condition link without a second disclosure click", async () => {
  const step = makeStep();
  const draft: RecipeDraft = { formId: "f", title: "F", steps: [step] };
  const props = {
    step,
    draft,
    dispatch: vi.fn(),
    catalog: CATALOG,
    onStepIdChange: vi.fn(),
  };
  const view = render(<StepEditor {...props} focusLogic />);
  expect(
    screen.getByRole("button", { name: "Page settings and logic" }),
  ).toHaveAttribute("aria-expanded", "true");
  const heading = screen.getByRole("heading", {
    name: "When this page is shown",
  });
  await waitFor(() => expect(heading).toHaveFocus());
  await userEvent.tab();
  expect(screen.getByRole("combobox", { name: "Add behaviour" })).toHaveFocus();
  view.rerender(
    <StepEditor
      {...props}
      step={makeStep({ stepId: "step-2" })}
      focusLogic={false}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Page settings and logic" }),
  ).toHaveAttribute("aria-expanded", "false");
});

it("duplicates a question beside its source and edits the copy instead of the last question", async () => {
  const user = userEvent.setup();
  function Page() {
    const [draft, dispatch] = useReducer(recipeReducer, {
      formId: "f",
      title: "F",
      steps: [
        makeStep({
          fields: [
            {
              id: "first",
              kind: "component",
              ref: "components/generic-text",
              overrides: {
                fieldId: "first",
                label: "First question",
                hint: "Original guidance",
              },
            },
            {
              id: "last",
              kind: "component",
              ref: "components/generic-text",
              overrides: { fieldId: "last", label: "Last question" },
            },
          ],
        }),
      ],
    });
    return (
      <StepEditor
        step={draft.steps[0]}
        draft={draft}
        dispatch={dispatch}
        catalog={getCatalog()}
        onStepIdChange={vi.fn()}
      />
    );
  }
  render(<Page />);
  await user.click(
    screen.getByRole("button", { name: "Actions for First question" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Duplicate question" }),
  );
  const editor = await screen.findByRole("dialog", { name: "Edit question" });
  const label = within(editor).getByRole("textbox", {
    name: "Label",
  });
  expect(label).toHaveValue("First question (copy)");
  await user.clear(label);
  await user.type(label, "Copied question");
  await user.click(within(editor).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Edit question" }),
    ).not.toBeInTheDocument(),
  );
  const rows = within(screen.getByRole("region", { name: "Questions" }));
  expect(
    rows
      .getAllByRole("button", { name: /^Edit / })
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual([
    "Edit First question",
    "Edit Copied question",
    "Edit Last question",
  ]);
  expect(screen.getAllByText("Original guidance")).toHaveLength(2);
  // Undo removes only the copy, keeping unrelated edits made since duplication.
  const pageTitle = screen.getByRole("textbox", { name: "Page title" });
  await user.clear(pageTitle);
  await user.type(pageTitle, "Updated page");
  await user.click(rows.getByRole("button", { name: "Undo" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Edit Copied question" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Edit First question" }),
  ).toBeInTheDocument();
  expect(pageTitle).toHaveValue("Updated page");
  // Cancelling editing keeps the explicit Undo action available on the page.
  await user.click(
    screen.getByRole("button", { name: "Actions for First question" }),
  );
  await user.click(
    await screen.findByRole("menuitem", { name: "Duplicate question" }),
  );
  const copyEditor = await screen.findByRole("dialog", {
    name: "Edit question",
  });
  expect(within(copyEditor).getByRole("status")).toHaveTextContent(
    "The copy is already in this page",
  );
  await user.click(within(copyEditor).getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(rows.getByRole("button", { name: "Undo" }));
  expect(
    screen.queryByRole("button", { name: "Edit First question (copy)" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Edit Last question" }),
  ).toBeInTheDocument();
}, 30_000);
