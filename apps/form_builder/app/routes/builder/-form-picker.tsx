import { useState } from "react";
import { getRecipe, getFormConfig } from "../../server/forms";
import { deserializeRecipe } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import type { FormDefinitionSummary } from "../../types/index";
import styles from "../../styles/builder.module.css";

interface FormPickerProps {
  /** The forms to choose from, or `null` while the background fetch is in flight. */
  forms: FormDefinitionSummary[] | null;
  /** A message if the background fetch failed, otherwise `null`. */
  loadError: string | null;
  isDirty: boolean;
  catalog: RegistryCatalog;
  onLoad: (draft: RecipeDraft, formId: string, version: string) => void;
  onClose: () => void;
  /** Draft-only forms: hard-delete the draft rows (formId freed for reuse). */
  onRequestDelete: (form: FormDefinitionSummary) => void;
  /** Live published forms: write the tombstone (public site -> 410), reversible. */
  onRequestDisable: (form: FormDefinitionSummary) => void;
  /** Live published forms: permanently erase the on-disk recipe folder via PR. */
  onRequestErase: (form: FormDefinitionSummary) => void;
  /** Disabled published forms: clear the tombstone and restore the service. */
  onEnable: (form: FormDefinitionSummary) => void;
}

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FormPicker({ forms, loadError, isDirty, catalog, onLoad, onClose, onRequestDelete, onRequestDisable, onRequestErase, onEnable }: FormPickerProps) {
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
      // Fetch the recipe and the DB-only per-environment config together
      // (issue #607). The recipe never carries mdaContactId, so it comes from
      // the config sidecar and is stitched onto the deserialized draft. A config
      // fetch that fails (e.g. older API) shouldn't block opening the form, so
      // it degrades to "no selection".
      const [recipe, config] = await Promise.all([
        getRecipe({ data: { formId: form.formId } }) as Promise<ServiceContractRecipe>,
        getFormConfig({ data: { formId: form.formId } }).catch(
          () => ({ mdaContactId: null }) as { mdaContactId: string | null },
        ),
      ]);
      const draft = deserializeRecipe(recipe, catalog);
      const draftWithConfig: RecipeDraft = {
        ...draft,
        mdaContactId: config.mdaContactId,
      };
      onLoad(draftWithConfig, form.formId, form.version);
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
              {form.isDisabled && (
                <span className={styles.disabledBadge}>Disabled</span>
              )}
            </span>
            <span style={{ color: "#888", fontSize: "0.8rem" }}>{form.formId}</span>
            {loadingId === form.formId && <span> Loading…</span>}
            {/* Per-row action follows intent: drafts delete (id freed),
                disabled forms enable, and live published forms get both
                Disable (reversible 410 tombstone) and Erase (permanent on-disk
                recipe removal via PR). */}
            {!form.isPublished ? (
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
            ) : form.isDisabled ? (
              <button
                type="button"
                style={{ marginLeft: 8 }}
                disabled={!!loadingId}
                onClick={(e) => {
                  e.stopPropagation();
                  onEnable(form);
                }}
              >
                Enable
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.btnDanger}
                  style={{ marginLeft: 8 }}
                  disabled={!!loadingId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDisable(form);
                  }}
                >
                  Disable
                </button>
                <button
                  type="button"
                  className={styles.btnErase}
                  style={{ marginLeft: 8 }}
                  disabled={!!loadingId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestErase(form);
                  }}
                >
                  Erase
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
