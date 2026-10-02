import { classifyRecipientField } from "@govtech-bb/form-types";
import { submissionActionSummary } from "../../lib/submission-actions";
import { useConfirmation } from "../ui/dialog/confirmation";
import { ScrollArea } from "../ui/scroll-area";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Select } from "../ui/select";
import { useState } from "react";
import type { Dispatch } from "react";
import type {
  RecipeDraft,
  RecipeProcessorDraft,
  AuthorableProcessorType,
  ResolvedFieldId,
} from "@govtech-bb/form-builder";
import type { RecipeAction } from "./recipe-reducer";
import { ProcessorConfigForm } from "./processor-config-form";

interface ProcessorsEditorProps {
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
  fields: ResolvedFieldId[];
  embedded?: boolean;
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
  embedded = false,
}: ProcessorsEditorProps) {
  const confirm = useConfirmation();
  const processors = draft.processors ?? [];
  const [addType, setAddType] = useState<AuthorableProcessorType>("email");
  const hasApplicantEmail = processors.some(
    (p) =>
      p.type === "email" &&
      typeof p.config.recipientField === "string" &&
      !!p.config.recipientField.trim() &&
      classifyRecipientField(p.config.recipientField) === "submitted",
  );
  const questionLabels = Object.fromEntries(
    fields.map((f) => [`${f.stepId}.${f.fieldId}`, f.display]),
  );
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
        title: "Remove this action?",
        description: "It will stop running after you save the form.",
        confirmLabel: "Remove action",
        destructive: true,
      }))
    )
      return;
    dispatch({ type: "REMOVE_PROCESSOR", id });
  }

  const content = (
    <div
      className={
        embedded ? "" : "mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8"
      }
    >
      <section className="space-y-5">
        <div>
          {!embedded && (
            <h2 className="text-xl font-semibold text-ui-strong">
              After submission
            </h2>
          )}
          <p className="mt-2 text-sm text-ui-subtle">
            Each action runs separately. Applicant emails confirm receipt;
            department emails send the application details.
          </p>
        </div>

        {!hasApplicantEmail && (
          <Banner variant="alert" size="sm" role="alert">
            <div className="min-w-0 flex-1">
              Applicants will not receive a confirmation email. To send one, add
              an email action and choose their email question as the recipient.
            </div>
          </Banner>
        )}

        <div className="mb-5 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Select
              label="Action"
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
            Add action
          </Button>
        </div>

        {processors.length === 0 ? (
          <div className="py-2 text-[13.5px] text-ui-subtle">
            No actions added. Choose an action above to get started.
          </div>
        ) : (
          processors.map((p) => (
            <section
              className={
                embedded
                  ? "border-t border-ui-hairline pt-5"
                  : "rounded-lg border border-ui-hairline bg-ui-base p-5 sm:p-7"
              }
              key={p.id}
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>
                    {
                      submissionActionSummary(
                        p,
                        questionLabels,
                        draft.contactDetails?.email,
                      ).title
                    }
                  </strong>
                  <p className="mt-1 text-sm text-ui-subtle">
                    {
                      submissionActionSummary(
                        p,
                        questionLabels,
                        draft.contactDetails?.email,
                      ).description
                    }
                  </p>
                  {p.type === "email" && p.config.label && (
                    <p className="mt-1 text-xs text-ui-subtle">
                      {p.config.label}
                    </p>
                  )}
                </div>
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
            </section>
          ))
        )}
      </section>
    </div>
  );
  return embedded ? (
    content
  ) : (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="scroll-fade">
      {content}
    </ScrollArea>
  );
}
