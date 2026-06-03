import type {
  RecipeProcessorDraft,
  ResolvedFieldId,
} from "@govtech-bb/form-builder";
import { ValuePathPicker } from "./-value-path-picker";
import { KeyValueEditor } from "./-key-value-editor";
import styles from "../../styles/builder.module.css";

interface ProcessorConfigFormProps {
  processor: RecipeProcessorDraft;
  fields: ResolvedFieldId[];
  // Receives the FULL replacement config. Each handler spreads the existing
  // config first, so unrendered keys (notably webhook `secret`) survive.
  onConfigChange: (config: Record<string, unknown>) => void;
  // True when the form's contactDetails carries an `email` (issue #547). Since
  // `contactDetails.email` is now optional (issue #607), this gates the
  // `contactDetails.email` recipient option on the email actually being present
  // — not merely on a contactDetails object existing.
  hasContactEmail?: boolean;
}

const WEBHOOK_METHODS = ["POST", "PUT", "PATCH"] as const;

// The templatable fields infer as `string | jsonLogic` (see `dynamic()`); v1
// authors them as plain literals, so read them as text. A non-literal value
// (an expression authored in JSON) shows blank rather than crashing, and is
// only overwritten if the author actually edits the field.
function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export function ProcessorConfigForm({
  processor,
  fields,
  onConfigChange,
  hasContactEmail = false,
}: ProcessorConfigFormProps) {
  // Namespace ids by processor so labels associate correctly with several cards.
  const fid = (name: string) => `${name}-${processor.id}`;

  switch (processor.type) {
    case "email": {
      const config = processor.config;
      // Only offer email-like fields as the recipient: picking a name/date
      // field here yields a processor that fails at send time. The picker
      // stays generic; we filter its input. A previously-saved non-email
      // recipient is still preserved by the picker's `(current)` fallback.
      // The reserved `contactDetails.email` path (issue #547) is offered
      // alongside these via `extraOptions` and is unaffected by the filter.
      const recipientFields = fields.filter((f) =>
        f.fieldId.toLowerCase().includes("email"),
      );
      // Reserved (non-field) recipient options offered alongside the form's
      // fields. `config.mdaEmail` (issue #607) is the per-environment MDA
      // notification address resolved server-side from `form_config`, so it is
      // offered always — it doesn't depend on the recipe carrying contact
      // details. `contactDetails.email` (issue #547) is only offered when the
      // form actually has a contact email to resolve against.
      const recipientExtraOptions = [
        {
          value: "config.mdaEmail",
          label: "MDA notification email (per-environment)",
        },
        ...(hasContactEmail
          ? [
              {
                value: "contactDetails.email",
                label: "MDA contact email",
              },
            ]
          : []),
      ];
      return (
        <>
          <div className={styles.formGroup}>
            <label htmlFor={fid("label")}>Label</label>
            <input
              id={fid("label")}
              type="text"
              value={asText(config.label)}
              onChange={(e) => {
                // Prune to absent when emptied (it's optional, min length 1),
                // mirroring `subject`, so a blank label doesn't persist "".
                const next = { ...config };
                if (e.target.value) next.label = e.target.value;
                else delete next.label;
                onConfigChange(next);
              }}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={fid("recipientField")}>Recipient field</label>
            <ValuePathPicker
              id={fid("recipientField")}
              value={asText(config.recipientField)}
              fields={recipientFields}
              extraOptions={recipientExtraOptions}
              onChange={(recipientField) =>
                onConfigChange({ ...config, recipientField })
              }
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={fid("subject")}>Subject (optional)</label>
            <input
              id={fid("subject")}
              type="text"
              value={asText(config.subject)}
              onChange={(e) => {
                const next = { ...config };
                if (e.target.value) next.subject = e.target.value;
                else delete next.subject;
                onConfigChange(next);
              }}
            />
          </div>
        </>
      );
    }

    case "webhook": {
      const config = processor.config;
      return (
        <>
          <div className={styles.formGroup}>
            <label htmlFor={fid("url")}>URL</label>
            <input
              id={fid("url")}
              type="text"
              value={asText(config.url)}
              onChange={(e) => onConfigChange({ ...config, url: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={fid("method")}>Method</label>
            <select
              id={fid("method")}
              value={config.method ?? "POST"}
              onChange={(e) =>
                onConfigChange({ ...config, method: e.target.value })
              }
            >
              {WEBHOOK_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <div className={styles.fieldLabel}>Headers</div>
            <KeyValueEditor
              value={(config.headers ?? {}) as Record<string, string | number>}
              onChange={(headers) => {
                // Prune `headers` to absent when emptied (it's optional), so a
                // webhook with no headers doesn't persist an empty `{}`.
                const next = { ...config };
                if (Object.keys(headers).length > 0) next.headers = headers;
                else delete next.headers;
                onConfigChange(next);
              }}
              addLabel="Add header"
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={fid("signatureHeader")}>Signature header</label>
            <input
              id={fid("signatureHeader")}
              type="text"
              value={config.signatureHeader ?? ""}
              onChange={(e) =>
                onConfigChange({ ...config, signatureHeader: e.target.value })
              }
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={fid("timeoutMs")}>Timeout (ms)</label>
            <input
              id={fid("timeoutMs")}
              type="number"
              value={config.timeoutMs ?? ""}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  timeoutMs:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </>
      );
    }

    case "spreadsheet":
    case "opencrvs": {
      const config = processor.config;
      return (
        <div className={styles.formGroup}>
          <div className={styles.fieldLabel}>Config</div>
          <KeyValueEditor
            value={config}
            onChange={(record) => onConfigChange(record)}
            addLabel="Add field"
          />
        </div>
      );
    }

    case "payment":
      return (
        <div className={styles.processorReadOnly} role="note">
          Payment processors aren&apos;t editable in the builder yet. This
          processor is preserved as-is on deploy — edit its config in the recipe
          JSON directly.
        </div>
      );
  }
}
