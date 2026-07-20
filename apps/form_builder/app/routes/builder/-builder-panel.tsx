import type { Dispatch } from "react";
import { Layers01Icon } from "hugeicons-react";
import type {
  RecipeDraft,
  RecipeStepDraft,
  RegistryCatalog,
  resolveFieldIds,
} from "@govtech-bb/form-builder";
import type { RecipeAction } from "./-recipe-reducer";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
import { ContactDetailsEditor } from "./-contact-details-editor";
import { ProcessorsEditor } from "./-processors-editor";
import { StepEditor } from "./-step-editor";
import styles from "../../styles/builder.module.css";

interface BuilderPanelProps {
  mainView: "step" | "processors" | "contactDetails";
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
  catalog: RegistryCatalog;
  selectedStep: RecipeStepDraft | null;
  mdaContacts: MdaContact[] | null;
  mdaContactsLoadError?: string | null;
  resolvedFieldIds: ReturnType<typeof resolveFieldIds>;
  onCreateContact: (input: CreateMdaContactInput) => Promise<MdaContact>;
  onStepIdChange: (oldId: string, newId: string) => void;
}

export function BuilderPanel({
  mainView,
  draft,
  dispatch,
  catalog,
  selectedStep,
  mdaContacts,
  mdaContactsLoadError,
  resolvedFieldIds,
  onCreateContact,
  onStepIdChange,
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
        draft={draft}
        dispatch={dispatch}
        catalog={catalog}
        onStepIdChange={onStepIdChange}
      />
    );
  }

  return (
    <div className={styles.noStepSelected}>
      <div className={styles.emptyState}>
        <Layers01Icon size={28} />
        <p>Select or add a step to begin</p>
      </div>
    </div>
  );
}
