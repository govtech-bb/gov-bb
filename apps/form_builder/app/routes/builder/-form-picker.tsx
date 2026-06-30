import { useState } from "react";
import { getRecipe, getFormConfig } from "../../server/forms";
import { deserializeRecipe, mergeDbProcessors } from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe, Processor } from "@govtech-bb/form-types";
import type { BuilderFormSummary } from "../../types/index";
import styles from "../../styles/builder.module.css";
import { useEscClose } from "./-use-esc-close";

interface FormPickerProps {
  /** The forms to choose from, or `null` while the background fetch is in flight. */
  forms: BuilderFormSummary[] | null;
  /** A message if the background fetch failed, otherwise `null`. */
  loadError: string | null;
  isDirty: boolean;
  catalog: RegistryCatalog;
  onLoad: (draft: RecipeDraft, formId: string) => void;
  onClose: () => void;
  /** Draft-only forms: hard-delete the draft rows (formId freed for reuse). */
  onRequestDelete: (form: BuilderFormSummary) => void;
  /** Live published forms: write the tombstone (public site -> 410), reversible. */
  onRequestDisable: (form: BuilderFormSummary) => void;
  /** Live published forms: permanently erase the on-disk recipe folder via PR. */
  onRequestErase: (form: BuilderFormSummary) => void;
  /** Disabled published forms: clear the tombstone and restore the service. */
  onEnable: (form: BuilderFormSummary) => void;
  /** Open the chosen form's recipe as a new unsaved "Copy of …" draft. */
  onDuplicate: (draft: RecipeDraft) => void;
}

function matches(query: string, ...fields: Array<string | undefined>) {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) => f !== undefined && f.toLowerCase().includes(q));
}

export function FormPicker({ forms, loadError, isDirty, catalog, onLoad, onClose, onRequestDelete, onRequestDisable, onRequestErase, onEnable, onDuplicate }: FormPickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // `forms` is null while the background fetch is in flight; treat that as an
  // empty list for filtering so the loading/empty states below own the messaging.
  const filtered = (forms ?? []).filter((form) => matches(query, form.title, form.formId));

  async function handleSelect(form: BuilderFormSummary) {
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
          () =>
            ({ mdaContactId: null, processors: null }) as {
              mdaContactId: string | null;
              processors: Processor[] | null;
            },
        ),
      ]);
      const draft = deserializeRecipe(recipe, catalog);
      // Reconcile the recipe's processors with the DB-resident payment
      // processors (#716): non-payment come from the recipe, payment from the
      // DB. When the recipe still carries a payment processor and the DB has
      // none, mergeDbProcessors lifts it into the editor — re-saving then
      // persists it to the DB sibling and strips it from the recipe (#750).
      const draftWithConfig: RecipeDraft = {
        ...draft,
        mdaContactId: config.mdaContactId,
        processors: mergeDbProcessors(draft.processors, config.processors),
      };
      onLoad(draftWithConfig, form.formId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipe");
    } finally {
      setLoadingId(null);
    }
  }

  // Duplicate opens the chosen recipe as a brand-new unsaved draft. Only the
  // recipe is fetched (not the config sidecar): the form-definition processors
  // ride in the recipe, while the DB-only siblings (mdaContactId, payment
  // processors) are env-specific and intentionally start blank on the copy.
  // deserializeRecipe mints fresh editor ids, so the copy shares nothing
  // mutable with the source. The "-copy" formId / "Copy of" title seed unique
  // identifiers; the builder's live uniqueness check flags them if they collide
  // (e.g. duplicating the same form twice) so the author renames before saving.
  async function handleDuplicate(form: BuilderFormSummary) {
    if (isDirty && !window.confirm("Unsaved changes will be lost. Continue?")) return;
    setError(null);
    setLoadingId(form.formId);
    try {
      const recipe = (await getRecipe({ data: { formId: form.formId } })) as ServiceContractRecipe;
      const draft = deserializeRecipe(recipe, catalog);
      onDuplicate({
        ...draft,
        formId: `${draft.formId}-copy`,
        title: `Copy of ${draft.title}`,
        // A duplicate is a brand-new, unpublished form — start it hidden so it
        // can't inherit a `public` source's launch state by accident (#1682).
        meta: { visibility: "draft" },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recipe");
    } finally {
      setLoadingId(null);
    }
  }

  useEscClose(onClose);

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={`${styles.modalContent} ${styles.modalContentWide}`} role="dialog" aria-modal="true" aria-label="Open Form" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
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
          <div role="status">
            <span className={styles.srOnly}>Loading forms…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skelRow} />
            ))}
          </div>
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
            {/* Duplicate is non-destructive and works on any form (a published
                form makes a fine template), so it sits ahead of the
                publish-state danger cluster below. */}
            <button
              type="button"
              style={{ marginLeft: 8 }}
              disabled={!!loadingId}
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicate(form);
              }}
            >
              Duplicate
            </button>
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
