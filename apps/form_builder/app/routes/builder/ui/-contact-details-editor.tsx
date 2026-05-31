import { useState } from "react";
import type { Dispatch } from "react";
import type { RecipeDraft } from "@govtech-bb/form-builder";
import { contactDetailsSchema } from "@govtech-bb/form-types";
import type { ContactDetails } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";
import styles from "../../../styles/builder.module.css";

interface ContactDetailsEditorProps {
  draft: RecipeDraft;
  dispatch: Dispatch<RecipeAction>;
}

/**
 * Form-level panel for a service's "Contact Details" (issue #452): the
 * organisation title, telephone, email and an optional address shown to the
 * citizen on the submission-confirmation step.
 *
 * Unlike the per-change processor config forms, this validates against
 * `contactDetailsSchema` and only commits on an explicit Save — so a partially
 * typed-out address can't be persisted mid-edit. The address is one
 * all-or-nothing group: leave every field blank to omit it; fill any field and
 * the schema's `line1` + `city` requirements apply.
 */
export function ContactDetailsEditor({
  draft,
  dispatch,
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

  function handleSave() {
    // All-or-nothing address: if every address field is blank, omit the group;
    // otherwise include line1/city (blank or not) so the schema enforces them.
    const hasAnyAddress = [line1, line2, city, country].some(
      (v) => v.trim() !== "",
    );
    const candidate: ContactDetails = {
      title: title.trim(),
      telephoneNumber: telephoneNumber.trim(),
      email: email.trim(),
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
    dispatch({ type: "UPDATE_CONTACT_DETAILS", contactDetails: undefined });
  }

  return (
    <div className={styles.processorsEditor}>
      <div className={styles.sectionTitle}>Contact Details</div>

      <p className={styles.toolbarHint}>
        Shown to applicants on the confirmation step so they know who to contact
        about the service. Leave the address blank to omit it.
      </p>

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
