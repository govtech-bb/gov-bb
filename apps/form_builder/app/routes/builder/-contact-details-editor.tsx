import { useState } from "react";
import type { Dispatch } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { contactDetailsSchema } from "@govtech-bb/form-types";
import type { ContactDetails } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import type { CreateMdaContactInput, MdaContact } from "../../types/index";
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
  const existing = draft.contactDetails;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [telephoneNumber, setTelephoneNumber] = useState(
    existing?.telephoneNumber ?? "",
  );
  const [email, setEmail] = useState(existing?.email ?? "");
  const [line1, setLine1] = useState(existing?.address?.line1 ?? "");
  const [line2, setLine2] = useState(existing?.address?.line2 ?? "");
  const [city, setCity] = useState(existing?.address?.city ?? "");
  const [country, setCountry] = useState(existing?.address?.country ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  // The dropdown's selected value. "" = no selection, "__create__" = the
  // create-new affordance, otherwise an MDA contact id. Preselected from the
  // draft's recorded mdaContactId on open.
  const CREATE_VALUE = "__create__";
  const [selectedId, setSelectedId] = useState<string>(
    draft.mdaContactId ?? "",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Create-new form state.
  const [newLabel, setNewLabel] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTelephone, setNewTelephone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMdaEmail, setNewMdaEmail] = useState("");
  const [newLine1, setNewLine1] = useState("");
  const [newLine2, setNewLine2] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newCountry, setNewCountry] = useState("");

  // Apply a selected contact: fill the public contactDetails fields (so the
  // citizen-facing copy matches) AND record the contact id on the draft.
  function applyContact(contact: MdaContact) {
    const details = contactToContactDetails(contact);
    setTitle(details.title ?? "");
    setTelephoneNumber(details.telephoneNumber ?? "");
    setEmail(details.email ?? "");
    setLine1(details.address?.line1 ?? "");
    setLine2(details.address?.line2 ?? "");
    setCity(details.address?.city ?? "");
    setCountry(details.address?.country ?? "");
    setErrors([]);
    setSavedNotice(false);
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

  async function handleCreate() {
    const hasNewAddress = [newLine1, newLine2, newCity, newCountry].some(
      (v) => v.trim() !== "",
    );
    const input: CreateMdaContactInput = {
      label: newLabel.trim(),
      title: newTitle.trim(),
      telephone: newTelephone.trim(),
      email: newEmail.trim(),
      mdaEmail: newMdaEmail.trim(),
      ...(hasNewAddress
        ? {
            address: {
              line1: newLine1.trim(),
              ...(newLine2.trim() ? { line2: newLine2.trim() } : {}),
              city: newCity.trim(),
              ...(newCountry.trim() ? { country: newCountry.trim() } : {}),
            },
          }
        : {}),
    };
    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await onCreateContact(input);
      applyContact(created);
      setSelectedId(created.id);
      setShowCreate(false);
      // Reset the create form for next time.
      setNewLabel("");
      setNewTitle("");
      setNewTelephone("");
      setNewEmail("");
      setNewMdaEmail("");
      setNewLine1("");
      setNewLine2("");
      setNewCity("");
      setNewCountry("");
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Failed to create MDA contact",
      );
    } finally {
      setIsCreating(false);
    }
  }

  function handleSave() {
    // All-or-nothing address: if every address field is blank, omit the group;
    // otherwise include line1/city (blank or not) so the schema enforces them.
    const hasAnyAddress = [line1, line2, city, country].some(
      (v) => v.trim() !== "",
    );
    // Drop blank public fields to absent (they're all optional now, issue #607)
    // rather than persisting "" the schema's min(1)/email() rules would reject.
    const candidate: ContactDetails = {
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(telephoneNumber.trim()
        ? { telephoneNumber: telephoneNumber.trim() }
        : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(hasAnyAddress
        ? {
            address: {
              line1: line1.trim(),
              ...(line2.trim() ? { line2: line2.trim() } : {}),
              city: city.trim(),
              ...(country.trim() ? { country: country.trim() } : {}),
            },
          }
        : {}),
    };

    const parsed = contactDetailsSchema.safeParse(candidate);
    if (!parsed.success) {
      setSavedNotice(false);
      setErrors(
        parsed.error.issues.map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        }),
      );
      return;
    }

    setErrors([]);
    setSavedNotice(true);
    dispatch({ type: "UPDATE_CONTACT_DETAILS", contactDetails: parsed.data });
  }

  function handleClear() {
    setTitle("");
    setTelephoneNumber("");
    setEmail("");
    setLine1("");
    setLine2("");
    setCity("");
    setCountry("");
    setErrors([]);
    setSavedNotice(false);
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
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-title">Organisation title</label>
            <input
              id="nc-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-telephone">Telephone number</label>
            <input
              id="nc-telephone"
              type="text"
              value={newTelephone}
              onChange={(e) => setNewTelephone(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-email">Public email</label>
            <input
              id="nc-email"
              type="text"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-mda-email">
              MDA notification email (per-environment)
            </label>
            <input
              id="nc-mda-email"
              type="text"
              value={newMdaEmail}
              onChange={(e) => setNewMdaEmail(e.target.value)}
            />
          </div>
          <div className={styles.sectionTitle}>Address (optional)</div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-line1">Address line 1</label>
            <input
              id="nc-line1"
              type="text"
              value={newLine1}
              onChange={(e) => setNewLine1(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-line2">Address line 2</label>
            <input
              id="nc-line2"
              type="text"
              value={newLine2}
              onChange={(e) => setNewLine2(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-city">City</label>
            <input
              id="nc-city"
              type="text"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="nc-country">Country</label>
            <input
              id="nc-country"
              type="text"
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
            />
          </div>
          <div className={styles.addProcessorRow}>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className={styles.btnPrimary}
            >
              {isCreating ? "Creating…" : "Create and select"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setSelectedId(draft.mdaContactId ?? "");
                setCreateError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className={styles.validationErrors} role="alert">
          <strong>Fix these before saving contact details:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {savedNotice && errors.length === 0 && (
        <div className={styles.validationSuccess} role="status">
          Contact details saved to the draft.
        </div>
      )}

      <div className={styles.formGroup}>
        <label htmlFor="cd-title">Organisation title</label>
        <input
          id="cd-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-telephone">Telephone number</label>
        <input
          id="cd-telephone"
          type="text"
          value={telephoneNumber}
          onChange={(e) => setTelephoneNumber(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-email">Email</label>
        <input
          id="cd-email"
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className={styles.sectionTitle}>Address (optional)</div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-line1">Address line 1</label>
        <input
          id="cd-line1"
          type="text"
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-line2">Address line 2</label>
        <input
          id="cd-line2"
          type="text"
          value={line2}
          onChange={(e) => setLine2(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-city">City</label>
        <input
          id="cd-city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="cd-country">Country</label>
        <input
          id="cd-country"
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </div>

      <div className={styles.addProcessorRow}>
        <button type="button" onClick={handleSave} className={styles.btnPrimary}>
          Save contact details
        </button>
        <button type="button" onClick={handleClear} className={styles.btnDanger}>
          Clear contact details
        </button>
      </div>
    </div>
  );
}
