import { useState } from "react";
import type { Dispatch } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import type { ContactDetails } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
import { useContactDetailsForm } from "./-use-contact-details-form";
import {
  useCreateMdaContactForm,
  type CreateMdaContactForm,
} from "./-use-create-mda-contact-form";
import styles from "../../styles/builder.module.css";

interface ContactDetailsEditorProps {
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
  /** The per-environment MDA contact directory, or `null` while loading. */
  contacts: MdaContact[] | null;
  /** A message if the contact-directory fetch failed, otherwise `null`. */
  contactsLoadError?: string | null;
  /** Create a new MDA contact via the API, resolving to the created row. */
  onCreateContact: (input: CreateMdaContactInput) => Promise<MdaContact>;
}

// Maps an MDA contact's public fields onto the recipe's contactDetails shape:
// the contact's `telephone` becomes contactDetails' `telephoneNumber`, and the
// nullable address collapses to absent. Empty strings are dropped so a
// partially-filled contact yields a partial (and now valid, issue #607)
// contactDetails rather than empty strings the schema would reject.
function contactToContactDetails(contact: MdaContact): ContactDetails {
  const details: ContactDetails = {};
  if (contact.title) details.title = contact.title;
  if (contact.telephone) details.telephoneNumber = contact.telephone;
  if (contact.email) details.email = contact.email;
  if (contact.address) {
    details.address = {
      line1: contact.address.line1,
      ...(contact.address.line2 ? { line2: contact.address.line2 } : {}),
      city: contact.address.city,
      ...(contact.address.country ? { country: contact.address.country } : {}),
    };
  }
  return details;
}

interface NewMdaContactFormProps {
  form: CreateMdaContactForm;
  /** Called with the created contact once the POST succeeds. */
  onCreated: (contact: MdaContact) => void;
  onCancel: () => void;
}

// The "Create new MDA contact" card (issue #607). State + POST live in
// `useCreateMdaContactForm` (held by the parent so typed values survive a
// Cancel/reopen); this component is the presentation.
function NewMdaContactForm({ form, onCreated, onCancel }: NewMdaContactFormProps) {
  const { values, setValue, isCreating, createError } = form;
  return (
    <div className={styles.processorCard}>
      <div className={styles.sectionTitle}>New MDA contact</div>
      {createError && (
        <div className={styles.validationErrors} role="alert">
          {createError}
        </div>
      )}
      <div className={styles.formGroup}>
        <label htmlFor="nc-label">Label</label>
        <input
          id="nc-label"
          type="text"
          value={values.label}
          onChange={(e) => setValue("label", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-title">Organisation title</label>
        <input
          id="nc-title"
          type="text"
          value={values.title}
          onChange={(e) => setValue("title", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-telephone">Telephone number</label>
        <input
          id="nc-telephone"
          type="text"
          value={values.telephone}
          onChange={(e) => setValue("telephone", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-email">Public email</label>
        <input
          id="nc-email"
          type="text"
          value={values.email}
          onChange={(e) => setValue("email", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-mda-email">
          MDA notification email (per-environment)
        </label>
        <input
          id="nc-mda-email"
          type="text"
          value={values.mdaEmail}
          onChange={(e) => setValue("mdaEmail", e.target.value)}
        />
      </div>
      <div className={styles.sectionTitle}>Address (optional)</div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-line1">Address line 1</label>
        <input
          id="nc-line1"
          type="text"
          value={values.line1}
          onChange={(e) => setValue("line1", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-line2">Address line 2</label>
        <input
          id="nc-line2"
          type="text"
          value={values.line2}
          onChange={(e) => setValue("line2", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-city">City</label>
        <input
          id="nc-city"
          type="text"
          value={values.city}
          onChange={(e) => setValue("city", e.target.value)}
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="nc-country">Country</label>
        <input
          id="nc-country"
          type="text"
          value={values.country}
          onChange={(e) => setValue("country", e.target.value)}
        />
      </div>
      <div className={styles.addProcessorRow}>
        <button
          type="button"
          onClick={async () => {
            const created = await form.create();
            if (created) onCreated(created);
          }}
          disabled={isCreating}
          className={styles.btnPrimary}
        >
          {isCreating ? "Creating…" : "Create and select"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Form-level panel for a service's "Contact Details" (issue #452): the
 * organisation title, telephone, email and an optional address shown to the
 * citizen on the submission-confirmation step.
 *
 * Issue #607 adds a per-environment MDA contact dropdown at the top. Selecting
 * an existing contact fills the public fields below (via UPDATE_CONTACT_DETAILS)
 * and records the contact id on the draft (via SET_MDA_CONTACT) — the id is
 * DB-only and travels as a sibling of the save request, never inside the recipe.
 * "Create new" collects a contact, POSTs it, then selects it.
 *
 * The manual fields below still validate against `contactDetailsSchema` and
 * commit only on explicit Save. The address is one all-or-nothing group: leave
 * every field blank to omit it; fill any field and the schema's `line1` + `city`
 * requirements apply.
 */
export function ContactDetailsEditor({
  draft,
  dispatch,
  contacts,
  contactsLoadError = null,
  onCreateContact,
}: ContactDetailsEditorProps) {
  const form = useContactDetailsForm(draft.contactDetails, dispatch);
  const createForm = useCreateMdaContactForm(onCreateContact);

  // The dropdown's selected value. "" = no selection, "__create__" = the
  // create-new affordance, otherwise an MDA contact id. Preselected from the
  // draft's recorded mdaContactId on open.
  const CREATE_VALUE = "__create__";
  const [selectedId, setSelectedId] = useState<string>(
    draft.mdaContactId ?? "",
  );
  const [showCreate, setShowCreate] = useState(false);

  // Apply a selected contact: fill the public contactDetails fields (so the
  // citizen-facing copy matches) AND record the contact id on the draft.
  function applyContact(contact: MdaContact) {
    const details = contactToContactDetails(contact);
    form.fill(details);
    dispatch({ type: "UPDATE_CONTACT_DETAILS", contactDetails: details });
    dispatch({ type: "SET_MDA_CONTACT", mdaContactId: contact.id });
  }

  function handleSelectChange(value: string) {
    if (value === CREATE_VALUE) {
      setSelectedId(CREATE_VALUE);
      setShowCreate(true);
      return;
    }
    setShowCreate(false);
    setSelectedId(value);
    if (value === "") {
      // "None" — clear the recorded id but leave the typed-in fields alone.
      dispatch({ type: "SET_MDA_CONTACT", mdaContactId: null });
      return;
    }
    const contact = (contacts ?? []).find((c) => c.id === value);
    if (contact) applyContact(contact);
  }

  function handleClear() {
    form.reset();
    setSelectedId("");
    setShowCreate(false);
    dispatch({ type: "UPDATE_CONTACT_DETAILS", contactDetails: undefined });
    dispatch({ type: "SET_MDA_CONTACT", mdaContactId: null });
  }

  return (
    <div className={styles.processorsEditor}>
      <div className={styles.sectionTitle}>Contact Details</div>

      <p className={styles.toolbarHint}>
        Shown to applicants on the confirmation step so they know who to contact
        about the service. Leave the address blank to omit it.
      </p>

      <div className={styles.formGroup}>
        <label htmlFor="cd-mda-contact">MDA contact</label>
        <select
          id="cd-mda-contact"
          value={selectedId}
          onChange={(e) => handleSelectChange(e.target.value)}
        >
          <option value="">— none —</option>
          {(contacts ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          <option value={CREATE_VALUE}>+ Create new contact…</option>
        </select>
        {contacts === null && !contactsLoadError && (
          <p className={styles.toolbarHint}>Loading contacts…</p>
        )}
        {contactsLoadError && (
          <div className={styles.validationErrors} role="alert">
            {contactsLoadError}
          </div>
        )}
      </div>

      {showCreate && (
        <NewMdaContactForm
          form={createForm}
          onCreated={(created) => {
            applyContact(created);
            setSelectedId(created.id);
            setShowCreate(false);
          }}
          onCancel={() => {
            setShowCreate(false);
            setSelectedId(draft.mdaContactId ?? "");
            createForm.clearError();
          }}
        />
      )}

      {form.errors.length > 0 && (
        <div className={styles.validationErrors} role="alert">
          <strong>Fix these before saving contact details:</strong>
          <ul>
            {form.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {form.savedNotice && form.errors.length === 0 && (
        <div className={styles.validationSuccess} role="status">
          Contact details saved to the draft.
        </div>
      )}

      <div className={styles.formGroup}>
        <label htmlFor="cd-title">Organisation title</label>
        <input
          id="cd-title"
          type="text"
          value={form.title}
          onChange={(e) => form.setTitle(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-telephone">Telephone number</label>
        <input
          id="cd-telephone"
          type="text"
          value={form.telephoneNumber}
          onChange={(e) => form.setTelephoneNumber(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-email">Email</label>
        <input
          id="cd-email"
          type="text"
          value={form.email}
          onChange={(e) => form.setEmail(e.target.value)}
        />
      </div>

      <div className={styles.sectionTitle}>Address (optional)</div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-line1">Address line 1</label>
        <input
          id="cd-line1"
          type="text"
          value={form.line1}
          onChange={(e) => form.setLine1(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-line2">Address line 2</label>
        <input
          id="cd-line2"
          type="text"
          value={form.line2}
          onChange={(e) => form.setLine2(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-city">City</label>
        <input
          id="cd-city"
          type="text"
          value={form.city}
          onChange={(e) => form.setCity(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-country">Country</label>
        <input
          id="cd-country"
          type="text"
          value={form.country}
          onChange={(e) => form.setCountry(e.target.value)}
        />
      </div>

      <div className={styles.addProcessorRow}>
        <button type="button" onClick={form.save} className={styles.btnPrimary}>
          Save contact details
        </button>
        <button type="button" onClick={handleClear} className={styles.btnDanger}>
          Clear contact details
        </button>
      </div>
    </div>
  );
}
