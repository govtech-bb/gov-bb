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

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FormPicker({ forms, loadError, isDirty, catalog, onLoad, onClose }: FormPickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // `forms` is null while the background fetch is in flight; treat that as an
  // empty list for filtering so the loading/empty states below own the messaging.
  const filtered = (forms ?? []).filter((form) => matches(query, form.title, form.formId));

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

        {forms !== null && forms.length > 0 && filtered.length === 0 && (
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
          </div>
        ))}
      </div>
    </div>
  );
}
