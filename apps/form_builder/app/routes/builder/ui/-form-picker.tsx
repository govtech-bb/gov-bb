import { useState } from "react";
import { getRecipe } from "../../../server/forms";
import { deserializeRecipe } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { FormDefinitionSummary } from "../../../types/index";
import styles from "../../../styles/builder.module.css";

interface FormPickerProps {
  forms: FormDefinitionSummary[];
  isDirty: boolean;
  catalog: RegistryCatalog;
  onLoad: (draft: RecipeDraft, formId: string, version: string) => void;
  onClose: () => void;
  onRequestDelete: (form: FormDefinitionSummary) => void;
}

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FormPicker({ forms, isDirty, catalog, onLoad, onClose, onRequestDelete }: FormPickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = forms.filter((form) => matches(query, form.title, form.formId));

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

        <div className={styles.pickerSearch}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms…"
            className={styles.pickerSearchInput}
            aria-label="Search forms"
            autoFocus
          />
          {query && (
            <button
              type="button"
              className={styles.pickerSearchClear}
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div className={styles.validationErrors} style={{ marginBottom: 8 }}>
            {error}
          </div>
        )}

        {forms.length === 0 && <p style={{ color: "#888" }}>No forms found.</p>}
        {forms.length > 0 && filtered.length === 0 && (
          <p style={{ color: "#888" }}>No forms match your search.</p>
        )}

        {filtered.map((form) => (
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
            <button
              type="button"
              className={styles.btnDanger}
              style={{ marginLeft: 8 }}
              disabled={!!loadingId}
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(form);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
