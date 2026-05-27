import { useState } from "react";
import { getRecipe } from "../../../server/forms";
import { deserializeRecipe } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { FormDefinitionSummary } from "../../../types/index";
import styles from "../../../styles/builder.module.css";

interface FormPickerProps {
  /** The forms to choose from, or `null` while the background fetch is in flight. */
  forms: FormDefinitionSummary[] | null;
  /** A message if the background fetch failed, otherwise `null`. */
  loadError: string | null;
  isDirty: boolean;
  catalog: RegistryCatalog;
  onLoad: (draft: RecipeDraft, formId: string, version: string) => void;
  onClose: () => void;
}

export function FormPicker({ forms, loadError, isDirty, catalog, onLoad, onClose }: FormPickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(form: FormDefinitionSummary) {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    setError(null);
    setLoadingId(form.formId);
    try {
      const recipe = await getRecipe({ data: { formId: form.formId } }) as ServiceContractRecipe;
      const draft = deserializeRecipe(recipe, catalog);
      onLoad(draft, form.formId, form.version);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipe");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <strong>Open Form</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        {(error || loadError) && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {error || loadError}
          </div>
        )}

        {forms === null && !loadError && (
          <p style={{ color: "#888" }}>Loading forms…</p>
        )}

        {forms !== null && forms.length === 0 && (
          <p style={{ color: "#888" }}>No forms found.</p>
        )}

        {forms?.map((form) => (
          <div
            key={form.id}
            className={styles.fieldRow}
            style={{ cursor: loadingId ? "not-allowed" : "pointer" }}
            onClick={() => {
              if (!loadingId) handleSelect(form);
            }}
          >
            <span style={{ flex: 1 }}>
              <strong>{form.title || form.formId}</strong>{" "}
              <span className={styles.badge}>v{form.version}</span>
              {form.isPublished && (
                <span className={styles.publishedBadge}>Published</span>
              )}
            </span>
            <span style={{ color: "#888", fontSize: "0.8rem" }}>{form.formId}</span>
            {loadingId === form.formId && <span> Loading…</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
