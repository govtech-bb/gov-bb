import { useConfirmation } from "../../components/ui/dialog/confirmation";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Elevated } from "../../components/ui/surface";
import { Banner } from "../../components/ui/banner";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { useState } from "react";
import type { Dispatch } from "react";
import type {
  RecipeDraft,
  RecipeProcessorDraft,
  AuthorableProcessorType,
  ResolvedFieldId,
} from "@govtech-bb/form-builder";
import type { RecipeAction } from "./-recipe-reducer";
import { ProcessorConfigForm } from "./-processor-config-form";
import styles from "../../styles/builder.module.css";

interface ProcessorsEditorProps {
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
  fields: ResolvedFieldId[];
}

const PROCESSOR_LABELS: Record<RecipeProcessorDraft["type"], string> = {
  email: "Email confirmation",
  webhook: "Webhook",
  payment: "Payment",
  spreadsheet: "Spreadsheet export",
  opencrvs: "OpenCRVS forward",
};

// Every processor type is now authorable, including `payment` (#716): its
// config is editable here and persisted to the DB sibling form_config.config
// rather than the recipe.
const ADDABLE: { type: AuthorableProcessorType; label: string }[] = [
  { type: "email", label: PROCESSOR_LABELS.email },
  { type: "webhook", label: PROCESSOR_LABELS.webhook },
  { type: "payment", label: PROCESSOR_LABELS.payment },
  { type: "spreadsheet", label: PROCESSOR_LABELS.spreadsheet },
  { type: "opencrvs", label: PROCESSOR_LABELS.opencrvs },
];

/**
 * Form-level panel for a form's submission processors. Lists each processor as
 * a card with its type-specific config form, an add-by-type control, and a
 * non-blocking warning when no email confirmation processor is attached.
 */
export function ProcessorsEditor({
  draft,
  dispatch,
  fields,
}: ProcessorsEditorProps) {
  const confirm = useConfirmation();
  const processors = draft.processors ?? [];
  const [addType, setAddType] = useState<AuthorableProcessorType>("email");
  const hasEmail = processors.some((p) => p.type === "email");
  // `contactDetails.email` is now optional (issue #607), so a present
  // `contactDetails` object is no longer a sufficient gate — offer the
  // `contactDetails.email` recipient only when an email is actually set.
  // (`config.mdaEmail` is offered unconditionally inside ProcessorConfigForm.)
  const hasContactEmail = Boolean(draft.contactDetails?.email);

  function handleAdd() {
    dispatch({ type: "ADD_PROCESSOR", processorType: addType });
  }

  async function handleRemove(id: string) {
    if (
      !(await confirm({
        title: "Remove processor?",
        description: "Remove this processor?",
        confirmLabel: "Remove processor",
        destructive: true,
      }))
    )
      return;
    dispatch({ type: "REMOVE_PROCESSOR", id });
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="scroll-fade">
      <div className="p-4 sm:p-6">
        <Elevated
          offset={1}
          shadowLevel={2}
          className="mx-auto max-w-5xl rounded-xl p-4 sm:p-6"
        >
          <div className={styles.sectionTitle}>
            Processors ({processors.length})
          </div>

          {!hasEmail && (
            <Banner variant="alert" size="sm" role="alert">
              <div className="min-w-0 flex-1">
                No email confirmation processor is attached, so applicants
                won&apos;t receive a confirmation email. You can still deploy.
              </div>
            </Banner>
          )}

          <div className="mb-5 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <Select
                label="Processor type"
                id="add-processor-type"
                value={addType}
                onValueChange={(nextValue) => {
                  if (nextValue === null) return;
                  setAddType(nextValue as AuthorableProcessorType);
                }}
                items={[
                  ...ADDABLE.map((o) => ({ value: o.type, label: o.label })),
                ]}
              />
            </div>
            <Button
              type="button"
              onClick={handleAdd}
              variant="secondary"
              size="sm"
            >
              Add processor
            </Button>
          </div>

          {processors.length === 0 ? (
            <div className={styles.noProcessors}>No processors yet.</div>
          ) : (
            processors.map((p) => (
              <Elevated
                offset={1}
                shadowLevel={2}
                className="mb-4 rounded-xl p-3 sm:p-5"
                key={p.id}
              >
                <div className={styles.processorCardHeader}>
                  {/* Prefer the per-instance label (e.g. seeded "Applicant Email" /
                  "MDA Email", issue #501) so two email processors are
                  distinguishable; fall back to the type label otherwise. */}
                  <strong>
                    {(p.type === "email" && p.config.label) ||
                      PROCESSOR_LABELS[p.type]}
                  </strong>
                  <Button
                    type="button"
                    onClick={() => handleRemove(p.id)}
                    variant="secondary"
                    size="sm"
                  >
                    Remove
                  </Button>
                </div>
                <ProcessorConfigForm
                  processor={p}
                  fields={fields}
                  hasContactEmail={hasContactEmail}
                  onConfigChange={(config) =>
                    dispatch({
                      type: "UPDATE_PROCESSOR_CONFIG",
                      id: p.id,
                      config,
                    })
                  }
                />
              </Elevated>
            ))
          )}
        </Elevated>
      </div>
    </ScrollArea>
  );
}
