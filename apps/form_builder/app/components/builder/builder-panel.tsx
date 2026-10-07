import type { Dispatch } from "react";
import { StackIcon, PlusIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Empty } from "../ui/empty";

import { ScrollArea } from "../ui/scroll-area";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RegistryCatalog,
  resolveFieldIds,
} from "@govtech-bb/form-builder";
import { isRequiredStep, type RecipeAction } from "./recipe-reducer";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
import { ContactDetailsEditor } from "./contact-details-editor";
import { ProcessorsEditor } from "./processors-editor";
import { StepEditor } from "./step-editor";

interface BuilderPanelProps {
  mainView: "step" | "processors" | "contactDetails";
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  selectedStep: RecipeStepDraft | null;
  focusLogic?: boolean;
  mdaContacts: MdaContact[] | null;
  mdaContactsLoadError?: string | null;
  resolvedFieldIds: ReturnType<typeof resolveFieldIds>;
  onCreateContact: (input: CreateMdaContactInput) => Promise<MdaContact>;
  onStepIdChange: (oldId: string, newId: string) => void;
  onAddStep: () => void;
  onOpenForm: () => void;
}

export function BuilderPanel({
  mainView,
  draft,
  dispatch,
  catalog,
  selectedStep,
  focusLogic,
  mdaContacts,
  mdaContactsLoadError,
  resolvedFieldIds,
  onCreateContact,
  onStepIdChange,
  onAddStep,
  onOpenForm,
}: BuilderPanelProps) {
  if (mainView === "contactDetails") {
    return (
      <ContactDetailsEditor
        draft={draft}
        dispatch={dispatch}
        contacts={mdaContacts}
        contactsLoadError={mdaContactsLoadError}
        onCreateContact={onCreateContact}
      />
    );
  }

  if (mainView === "processors") {
    return (
      <ProcessorsEditor
        draft={draft}
        dispatch={dispatch}
        fields={resolvedFieldIds}
      />
    );
  }

  if (selectedStep !== null) {
    return (
      <StepEditor
        step={selectedStep}
        focusLogic={focusLogic}
        draft={draft}
        dispatch={dispatch}
        catalog={catalog}
        onStepIdChange={onStepIdChange}
      />
    );
  }

  const hasEditableSteps = draft.steps.some(
    (step) => !isRequiredStep(step.stepId),
  );

  return (
    <ScrollArea
      aria-label="Form workspace"
      className="min-h-0 flex-1"
      viewportClassName="scroll-fade"
    >
      <div className="flex min-h-[min(38rem,65dvh)] items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-xl">
          <Empty
            icon={
              <span className="flex size-12 items-center justify-center rounded-xl bg-ui-recessed text-ui-subtle">
                <StackIcon size={24} aria-hidden="true" />
              </span>
            }
            title={hasEditableSteps ? "Continue your form" : "Build your form"}
            description={
              hasEditableSteps
                ? "Choose a page from the outline, or add a page to your application."
                : "Start with a page, then add the questions people need to answer. Review, declaration, and confirmation pages are already included."
            }
            className="border-0 bg-transparent px-6 py-10 sm:px-10 sm:py-14"
            contents={
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="primary"
                  onClick={onAddStep}
                  icon={<PlusIcon aria-hidden="true" />}
                >
                  {hasEditableSteps ? "Add a page" : "Add your first page"}
                </Button>
                <Button
                  variant="outline"
                  onClick={onOpenForm}
                  icon={<FolderOpenIcon aria-hidden="true" />}
                >
                  Open an existing form
                </Button>
              </div>
            }
          />
        </div>
      </div>
    </ScrollArea>
  );
}
