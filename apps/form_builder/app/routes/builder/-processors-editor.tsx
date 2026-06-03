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

// Only these four are authorable; `payment` is preserved read-only, never added.
const ADDABLE: { type: AuthorableProcessorType; label: string }[] = [
  { type: "email", label: PROCESSOR_LABELS.email },
  { type: "webhook", label: PROCESSOR_LABELS.webhook },
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

  function handleRemove(id: string) {
    if (!window.confirm("Remove this processor?")) return;
    dispatch({ type: "REMOVE_PROCESSOR", id });
  }

  return (
    <div className={styles.processorsEditor}>
      <div className={styles.sectionTitle}>Processors ({processors.length})</div>

      {!hasEmail && (
        <div className={styles.processorWarning} role="alert">
          No email confirmation processor is attached, so applicants won&apos;t
          receive a confirmation email. You can still deploy.
        </div>
      )}

      <div className={styles.addProcessorRow}>
        <label htmlFor="add-processor-type">Processor type</label>
        <select
          id="add-processor-type"
          value={addType}
          onChange={(e) =>
            setAddType(e.target.value as AuthorableProcessorType)
          }
        >
          {ADDABLE.map((o) => (
            <option key={o.type} value={o.type}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAdd}>
          Add processor
        </button>
      </div>

      {processors.length === 0 ? (
        <div className={styles.noProcessors}>No processors yet.</div>
      ) : (
        processors.map((p) => (
          <div key={p.id} className={styles.processorCard}>
            <div className={styles.processorCardHeader}>
              {/* Prefer the per-instance label (e.g. seeded "Applicant Email" /
                  "MDA Email", issue #501) so two email processors are
                  distinguishable; fall back to the type label otherwise. */}
              <strong>
                {(p.type === "email" && p.config.label) ||
                  PROCESSOR_LABELS[p.type]}
              </strong>
              <button type="button" onClick={() => handleRemove(p.id)}>
                Remove
              </button>
            </div>
            <ProcessorConfigForm
              processor={p}
              fields={fields}
              hasContactEmail={hasContactEmail}
              onConfigChange={(config) =>
                dispatch({ type: "UPDATE_PROCESSOR_CONFIG", id: p.id, config })
              }
            />
          </div>
        ))
      )}
    </div>
  );
}
