import { useConfirmation } from "../ui/dialog/confirmation";
import { Input, InputArea } from "../ui/input";
import { Elevated } from "../ui/surface";
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

const STEP_ID_ERROR =
  "Use lowercase letters, digits, and hyphens only. Must start with a letter (e.g. my-step, step-1).";
const STEP_ID_DUPLICATE_ERROR =
  "This Step ID is already used by another step. Step IDs must be unique within a form.";
const STEP_ID_DEFAULT_PATTERN = /^step-\d+$/;

interface StepEditorProps {
  step: RecipeStepDraft;
  draft: RecipeDraft;
  dispatch: React.Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  onStepIdChange: (oldId: string, newId: string) => void;
}

export function StepEditor({
  step,
  draft,
  dispatch,
  catalog,
  onStepIdChange,
}: StepEditorProps) {
  const confirm = useConfirmation();
  const [localStepId, setLocalStepId] = useState(step.stepId);
  const [stepIdError, setStepIdError] = useState("");
  const [editingField, setEditingField] = useState<RecipeFieldDraft | null>(
    null,
  );
  const [isFieldEditOpen, setIsFieldEditOpen] = useState(false);

  // Keep localStepId in sync when a different step is selected from the sidebar.
  useEffect(() => {
    setLocalStepId(step.stepId);
    setStepIdError("");
    setIsFieldEditOpen(false);
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

  function handleAddField(field: Omit<RecipeFieldDraft, "id">) {
    dispatch({ type: "ADD_FIELD", stepId: step.stepId, field });
  }

  // The add-field picker sits below the Fields list, so a newly added field
  // lands off-screen above the click — scroll it into view and flash it.
  // Keyed on stepId too so switching to a longer step doesn't false-trigger.
  const fieldsSectionRef = useRef<HTMLElement>(null);
  const prevFieldsRef = useRef({
    stepId: step.stepId,
    count: step.fields.length,
  });
  useEffect(() => {
    const prev = prevFieldsRef.current;
    prevFieldsRef.current = { stepId: step.stepId, count: step.fields.length };
    if (prev.stepId !== step.stepId || step.fields.length <= prev.count) return;
    const rows = fieldsSectionRef.current?.querySelectorAll("[data-field-row]");
    const added = rows?.[rows.length - 1];
    if (!(added instanceof HTMLElement)) return;
    added.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    added.classList.add("motion-safe:animate-field-row-flash");
    const timer = setTimeout(
      () => added.classList.remove("motion-safe:animate-field-row-flash"),
      1300,
    );
    return () => clearTimeout(timer);
  }, [step.stepId, step.fields.length]);

  async function handleRemoveField(fieldId: string) {
    if (
      !(await confirm({
        title: "Remove field?",
        description: "Remove this field?",
        confirmLabel: "Remove field",
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
      <div className="min-w-0 p-6 max-sm:p-4">
        {/* Step Metadata */}
        <Elevated
          offset={1}
          shadowLevel={2}
          render={<section />}
          className="mb-4 rounded-xl p-5"
        >
          <h2 className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
            Step Metadata
          </h2>
          <div className="mb-3.5 flex flex-col gap-1.25 [&_input]:box-border [&_input]:w-full [&_textarea]:box-border [&_textarea]:w-full [&_label]:text-[13px] [&_label]:font-medium [&_label]:text-ui-brand-hover [[data-field-row]>&]:w-full">
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
          </div>
          <div className="mb-3.5 flex flex-col gap-1.25 [&_input]:box-border [&_input]:w-full [&_textarea]:box-border [&_textarea]:w-full [&_label]:text-[13px] [&_label]:font-medium [&_label]:text-ui-brand-hover [[data-field-row]>&]:w-full">
            <Input
              label="Step title"
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
          </div>
          <div className="mb-3.5 flex flex-col gap-1.25 [&_input]:box-border [&_input]:w-full [&_textarea]:box-border [&_textarea]:w-full [&_label]:text-[13px] [&_label]:font-medium [&_label]:text-ui-brand-hover [[data-field-row]>&]:w-full">
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
        </Elevated>

        {/* Confirmation-page copy. The submission-confirmation step renders this
          markdown ("What happens next") below the submission receipt (#1292).
          Authored here so it round-trips through publish instead of being
          dropped. Reuses the content CMS's visual editor in the constrained
          form-content profile. */}
        {showMarkdownEditor && (
          <Elevated
            offset={1}
            shadowLevel={2}
            render={<section />}
            className="mb-4 rounded-xl p-5"
          >
            <h2 className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
              {isConfirmation ? "Confirmation page content" : "Step content"}
            </h2>
            <div className="mb-3.5 flex flex-col gap-1.25 [&_input]:box-border [&_input]:w-full [&_textarea]:box-border [&_textarea]:w-full [&_label]:text-[13px] [&_label]:font-medium [&_label]:text-ui-brand-hover [[data-field-row]>&]:w-full">
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
              <span className="mt-1 block text-[12px] leading-[1.3] text-ui-subtle">
                {isConfirmation
                  ? "Shown on the confirmation page after the applicant submits, below the submission receipt."
                  : "Shown at the top of this step, above any fields. A step with content and no fields renders as an information page."}
              </span>
            </div>
          </Elevated>
        )}

        {/* Fields list — hidden for review/confirmation steps that accept no
          fields. The "Add field" picker is split into its own block below so
          Step Behaviours can render between the list and the picker (#566). */}
        {!noFields && (
          <Elevated
            offset={1}
            shadowLevel={2}
            render={<section ref={fieldsSectionRef} />}
            className="mb-4 rounded-xl p-5"
          >
            <h2 className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
              Fields ({step.fields.length})
            </h2>
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
                    onRemove={() => handleRemoveField(field.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </Elevated>
        )}

        <FieldEditPanel
          open={isFieldEditOpen}
          field={editingField}
          catalog={catalog}
          draft={draft}
          stepId={step.stepId}
          dispatch={dispatch}
          onClose={() => setIsFieldEditOpen(false)}
        />

        {/* Step behaviours */}
        <Elevated
          offset={1}
          shadowLevel={2}
          render={<section />}
          className="mb-4 rounded-xl p-5"
        >
          <h2 className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
            Step Behaviours
          </h2>
          <BehavioursEditor
            scope="step"
            behaviours={step.behaviours}
            fieldRefs={fieldRefs}
            stepRefs={stepRefs}
            onChange={handleSetBehaviours}
            currentStepId={step.stepId}
          />
        </Elevated>

        {/* Inline field picker palette — renders below Step Behaviours (#566),
          hidden for no-fields steps alongside the Fields list. */}
        {!noFields && (
          <Elevated
            offset={1}
            shadowLevel={2}
            render={<section />}
            className="mb-4 rounded-xl p-5"
          >
            <h2 className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.05em] text-ui-subtle uppercase">
              Add field
            </h2>
            <FieldPicker catalog={catalog} onAddField={handleAddField} />
          </Elevated>
        )}
      </div>
    </ScrollArea>
  );
}
