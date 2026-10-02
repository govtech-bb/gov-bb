import { Collapsible } from "../ui/collapsible";
import { useConfirmation } from "../ui/dialog/confirmation";
import { Input, InputArea } from "../ui/input";
import { Button } from "../ui/button";
import { Banner } from "../ui/banner";
import { Dialog } from "../ui/dialog";
import { PlusIcon } from "@phosphor-icons/react";
import { ScrollArea } from "../ui/scroll-area";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RecipeFieldDraft,
  RegistryCatalog,
} from "@govtech-bb/form-builder";
import type { Behaviour } from "@govtech-bb/form-types";
import type { RecipeAction } from "./recipe-reducer";
import {
  isConfirmationStep,
  isNoFieldsStep,
  isRequiredStep,
} from "./recipe-reducer";
import { KEBAB_ID_PATTERN, kebabize } from "./id-validation";
import { getFieldRefs, getStepRefs } from "./recipe-refs";
import { BehavioursEditor } from "./behaviours-editor";
import { BodyEditor } from "../body-editor/body-editor";
import { FieldPicker } from "./field-picker";
import { FieldEditPanel } from "./field-edit-panel";
import { SortableFieldRow } from "./sortable-field-row";
import { duplicateFieldDraft } from "./duplicate";

const STEP_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. my-step, step-1).";
const STEP_ID_DUPLICATE_ERROR =
  "This Step ID is already used by another step. Step IDs must be unique within a form.";
const STEP_ID_DEFAULT_PATTERN = /^step-\d+$/;

interface StepEditorProps {
  step: RecipeStepDraft;
  focusLogic?: boolean;
  draft: RecipeDraft;
  dispatch: React.Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  onStepIdChange: (oldId: string, newId: string) => void;
}

export function StepEditor({
  step,
  focusLogic = false,
  draft,
  dispatch,
  catalog,
  onStepIdChange,
}: StepEditorProps) {
  const confirm = useConfirmation();
  const logicHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusLogic) return;
    // Wait for the route's focus restoration and the open panel's layout.
    let focusFrame = 0;
    const frame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        logicHeading.current?.focus({ preventScroll: true });
        logicHeading.current?.scrollIntoView?.({ block: "start" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
    };
  }, [focusLogic, step.stepId]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [localStepId, setLocalStepId] = useState(step.stepId);
  const [stepIdError, setStepIdError] = useState("");
  const [editingField, setEditingField] = useState<RecipeFieldDraft | null>(
    null,
  );
  const [isFieldEditOpen, setIsFieldEditOpen] = useState(false);
  const [duplicatedFieldId, setDuplicatedFieldId] = useState<string | null>(
    null,
  );

  // Keep localStepId in sync when a different step is selected from the sidebar.
  useEffect(() => {
    setLocalStepId(step.stepId);
    setStepIdError("");
    setIsFieldEditOpen(false);
    setPickerOpen(false);
  }, [step.stepId]);

  const fieldRefs = useMemo(
    () => getFieldRefs(draft, catalog),
    [draft, catalog],
  );
  const stepRefs = useMemo(() => getStepRefs(draft), [draft]);

  // Review/confirmation steps carry no author-added fields, so hide the entire
  // Fields section (list + picker) for them. See isNoFieldsStep.
  const noFields = isNoFieldsStep(step.stepId);

  // The submission-confirmation step renders recipe-authored markdown ("What
  // happens next") below the receipt, and any editable step may carry intro
  // markdown (e.g. a content-only first page rendered above its fields) — so
  // expose the markdown editor on the confirmation step and all editable steps.
  // The platform-managed review/confirmation steps are excluded except the
  // confirmation step itself.
  const isConfirmation = isConfirmationStep(step.stepId);
  const showMarkdownEditor = isConfirmation || !isRequiredStep(step.stepId);

  function handleStepIdChange(newId: string) {
    setLocalStepId(newId);
    if (!KEBAB_ID_PATTERN.test(newId)) {
      setStepIdError(STEP_ID_ERROR);
      return;
    }
    // Reject a stepId that collides with another step (recipe-wide uniqueness).
    const duplicate = draft.steps.some(
      (s) => s.stepId !== step.stepId && s.stepId === newId,
    );
    if (duplicate) {
      setStepIdError(STEP_ID_DUPLICATE_ERROR);
      return;
    }
    setStepIdError("");
    dispatch({
      type: "UPDATE_STEP_META",
      stepId: step.stepId,
      meta: { stepId: newId },
    });
    onStepIdChange(step.stepId, newId);
  }

  const addedInStep = useRef<string | null>(null);
  function handleAddField(field: Omit<RecipeFieldDraft, "id">) {
    addedInStep.current = step.stepId;
    dispatch({ type: "ADD_FIELD", stepId: step.stepId, field });
    setPickerOpen(false);
  }

  function handleDuplicateField(field: RecipeFieldDraft) {
    const copy = duplicateFieldDraft(draft, step, field, catalog);
    setDuplicatedFieldId(copy.id);
    addedInStep.current = step.stepId;
    dispatch({
      type: "DUPLICATE_FIELD",
      stepId: step.stepId,
      fieldId: field.id,
      copy,
    });
  }

  // Open questions added by the picker or Duplicate; AI additions only highlight the new row.
  const fieldsSectionRef = useRef<HTMLElement>(null);
  const duplicatedField = step.fields.find(
    (field) => field.id === duplicatedFieldId,
  );
  const duplicateNotice = duplicatedField ? (
    <Banner
      variant="secondary"
      size="sm"
      role="status"
      title={
        duplicatedField.kind === "block"
          ? "Question group duplicated"
          : "Question duplicated"
      }
      description="The copy is already in this page. Undo removes it."
      className="mb-4 [&>div]:flex-wrap"
      action={
        <Button
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          onClick={() => {
            dispatch({
              type: "REMOVE_FIELD",
              stepId: step.stepId,
              fieldId: duplicatedField.id,
            });
            if (editingField?.id === duplicatedField.id)
              setIsFieldEditOpen(false);
            setDuplicatedFieldId(null);
            fieldsSectionRef.current?.focus();
          }}
        >
          Undo
        </Button>
      }
    />
  ) : null;
  const prevFieldsRef = useRef({
    stepId: step.stepId,
    ids: new Set(step.fields.map((field) => field.id)),
  });
  useEffect(() => {
    const prev = prevFieldsRef.current;
    prevFieldsRef.current = {
      stepId: step.stepId,
      ids: new Set(step.fields.map((field) => field.id)),
    };
    if (prev.stepId !== step.stepId || step.fields.length <= prev.ids.size)
      return;
    const newIndex = step.fields.findIndex((field) => !prev.ids.has(field.id));
    if (newIndex < 0) return;
    if (addedInStep.current === step.stepId) {
      addedInStep.current = null;
      setEditingField(step.fields[newIndex]);
      setIsFieldEditOpen(true);
    }
    const rows = fieldsSectionRef.current?.querySelectorAll("[data-field-row]");
    const added = rows?.[newIndex];
    if (!(added instanceof HTMLElement)) return;
    added.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    added.classList.add("motion-safe:animate-field-row-flash");
    const timer = setTimeout(
      () => added.classList.remove("motion-safe:animate-field-row-flash"),
      1300,
    );
    return () => clearTimeout(timer);
  }, [step.stepId, step.fields]);

  async function handleRemoveField(fieldId: string) {
    if (
      !(await confirm({
        title: "Remove question?",
        description: "This removes the question from the current form draft.",
        confirmLabel: "Remove question",
        destructive: true,
      }))
    )
      return;
    dispatch({ type: "REMOVE_FIELD", stepId: step.stepId, fieldId });
    if (editingField?.id === fieldId) setIsFieldEditOpen(false);
  }

  function handleMoveFieldUp(index: number) {
    if (index <= 0) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex: index,
      toIndex: index - 1,
    });
  }

  function handleMoveFieldDown(index: number) {
    if (index >= step.fields.length - 1) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex: index,
      toIndex: index + 1,
    });
  }

  function handleSetBehaviours(behaviours: Behaviour[]) {
    dispatch({ type: "SET_STEP_BEHAVIOURS", stepId: step.stepId, behaviours });
  }

  // Require a small drag before activating so a click on the handle doesn't
  // start a drag — keeps the row's other buttons clickable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleFieldDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = step.fields.findIndex((f) => f.id === active.id);
    const toIndex = step.fields.findIndex((f) => f.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    dispatch({
      type: "REORDER_FIELDS",
      stepId: step.stepId,
      fromIndex,
      toIndex,
    });
  }

  return (
    <ScrollArea
      aria-label="Step editor"
      className="min-h-0 min-w-0 flex-1"
      viewportClassName="scroll-fade"
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-6 @min-[48rem]:px-8 @min-[48rem]:py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ui-subtle">
              Page{" "}
              {draft.steps.findIndex((item) => item.stepId === step.stepId) + 1}{" "}
              of {draft.steps.length}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ui-strong">
              {step.title || "Untitled page"}
            </h2>
          </div>
          {!noFields && (
            <Button
              variant="primary"
              onClick={() => setPickerOpen(true)}
              icon={<PlusIcon aria-hidden="true" />}
            >
              Add question
            </Button>
          )}
        </div>
        <section className="rounded-lg border border-ui-hairline bg-ui-base p-5 @min-[48rem]:p-7">
          <div className="space-y-4">
            <Input
              label="Page title"
              className="w-full"
              type="text"
              value={step.title}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_STEP_META",
                  stepId: step.stepId,
                  meta: { title: e.target.value },
                })
              }
              onBlur={(e) => {
                const title = e.target.value;
                if (!title) return;
                // Auto-derive stepId only if it's still the default placeholder (step-N)
                // and the user has not started editing it manually.
                const isDefault = STEP_ID_DEFAULT_PATTERN.test(step.stepId);
                const localUntouched = localStepId === step.stepId;
                if (isDefault && localUntouched) {
                  const derived = kebabize(title);
                  if (derived && derived !== step.stepId) {
                    dispatch({
                      type: "UPDATE_STEP_META",
                      stepId: step.stepId,
                      meta: { stepId: derived },
                    });
                    onStepIdChange(step.stepId, derived);
                  }
                }
              }}
            />
            <InputArea
              label="Description"
              className="w-full"
              value={step.description ?? ""}
              onChange={(e) =>
                dispatch({
                  type: "UPDATE_STEP_META",
                  stepId: step.stepId,
                  meta: { description: e.target.value || undefined },
                })
              }
              rows={2}
            />
          </div>
          {showMarkdownEditor && (
            <Collapsible.Root
              className="mt-5"
              defaultOpen={isConfirmation}
              key={`content-${step.stepId}`}
            >
              <Collapsible.DefaultTrigger className="cursor-pointer rounded py-2 text-sm font-medium text-ui-subtle hover:text-ui-default focus-visible:outline-2 focus-visible:outline-ui-focus">
                {isConfirmation
                  ? "Confirmation page content"
                  : "Instructions before the questions"}
              </Collapsible.DefaultTrigger>
              <Collapsible.Panel keepMounted>
                <div className="pt-3">
                  <BodyEditor
                    id={`step-${step.stepId}-markdown-content`}
                    ariaLabel={
                      isConfirmation
                        ? "Confirmation page content"
                        : `${step.stepId} step content`
                    }
                    value={step.markdownContent ?? ""}
                    onChange={(next) =>
                      dispatch({
                        type: "UPDATE_STEP_META",
                        stepId: step.stepId,
                        meta: { markdownContent: next || undefined },
                      })
                    }
                    profile={{ kind: "form-content" }}
                  />
                  <p className="mt-2 text-xs text-ui-subtle">
                    {isConfirmation
                      ? "Shown after submission, below the receipt."
                      : "Optional guidance shown at the top of this page."}
                  </p>
                </div>
              </Collapsible.Panel>
            </Collapsible.Root>
          )}
          {!noFields && (
            <section
              ref={fieldsSectionRef}
              aria-label="Questions"
              tabIndex={-1}
              className="mt-7"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Questions{" "}
                  <span className="ms-1 font-normal text-ui-subtle">
                    {step.fields.length}
                  </span>
                </h3>
                <span className="text-xs text-ui-subtle">Drag to reorder</span>
              </div>
              {!isFieldEditOpen && duplicateNotice}
              <DndContext
                // Stable id pins dnd-kit's `aria-describedby` (otherwise derived
                // from a module-global counter) so it can never differ between a
                // server and client render → hydration mismatch (#546).
                id="step-fields-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleFieldDragEnd}
              >
                <SortableContext
                  items={step.fields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {step.fields.map((field, idx) => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      catalog={catalog}
                      isFirst={idx === 0}
                      isLast={idx === step.fields.length - 1}
                      onMoveUp={() => handleMoveFieldUp(idx)}
                      onMoveDown={() => handleMoveFieldDown(idx)}
                      onEdit={() => {
                        setEditingField(field);
                        setIsFieldEditOpen(true);
                      }}
                      onDuplicate={() => handleDuplicateField(field)}
                      onRemove={() => handleRemoveField(field.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {step.fields.length === 0 && (
                <p className="rounded-lg bg-ui-canvas px-4 py-6 text-sm text-ui-subtle">
                  Add a question to start collecting information on this page.
                </p>
              )}
              <Button
                variant="outline"
                className="mt-3 w-full border-dashed"
                onClick={() => setPickerOpen(true)}
                icon={<PlusIcon aria-hidden="true" />}
              >
                Add question
              </Button>
            </section>
          )}
          {noFields && !isConfirmation && (
            <p className="mt-6 rounded-lg bg-ui-canvas p-4 text-sm text-ui-subtle">
              People review their answers here before submitting. The answers
              are filled in automatically.
            </p>
          )}
        </section>
        <Collapsible.Root
          className="mt-5 rounded-lg border border-ui-hairline bg-ui-base"
          key={`${step.stepId}:${focusLogic}`}
          defaultOpen={focusLogic}
        >
          <Collapsible.DefaultTrigger className="cursor-pointer rounded-lg px-5 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ui-focus">
            Page settings and logic
          </Collapsible.DefaultTrigger>
          <Collapsible.Panel keepMounted>
            <div className="space-y-5 border-t border-ui-hairline p-5">
              <Input
                label="Step ID"
                className="w-full"
                type="text"
                value={localStepId}
                readOnly={isRequiredStep(step.stepId)}
                onChange={(e) => {
                  if (isRequiredStep(step.stepId)) return;
                  handleStepIdChange(e.target.value);
                }}
                onBlur={() => {
                  // Mirror the Field ID Override input: normalize a non-kebab id on
                  // blur (e.g. `step_one` → `step-one`) instead of leaving it to
                  // fail server-side validation (#741).
                  if (isRequiredStep(step.stepId)) return;
                  const normalized = kebabize(localStepId);
                  if (normalized && normalized !== localStepId) {
                    handleStepIdChange(normalized);
                  }
                }}
                error={stepIdError}
              />
              <div>
                <h3
                  ref={logicHeading}
                  tabIndex={-1}
                  className="mb-3 scroll-mt-5 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ui-focus"
                >
                  When this page is shown
                </h3>
                <BehavioursEditor
                  scope="step"
                  behaviours={step.behaviours}
                  fieldRefs={fieldRefs}
                  stepRefs={stepRefs}
                  onChange={handleSetBehaviours}
                  currentStepId={step.stepId}
                />
              </div>
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
        <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
          <Dialog size="lg" className="space-y-5">
            <Dialog.Title>Add a question</Dialog.Title>
            <Dialog.Description>
              Choose the information you need from the applicant.
            </Dialog.Description>
            <FieldPicker catalog={catalog} onAddField={handleAddField} />
          </Dialog>
        </Dialog.Root>
        <FieldEditPanel
          open={isFieldEditOpen}
          notice={
            editingField?.id === duplicatedFieldId ? duplicateNotice : undefined
          }
          field={editingField}
          catalog={catalog}
          draft={draft}
          stepId={step.stepId}
          dispatch={dispatch}
          onClose={() => setIsFieldEditOpen(false)}
        />
      </div>
    </ScrollArea>
  );
}
