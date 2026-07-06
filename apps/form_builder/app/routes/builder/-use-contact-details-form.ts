import { useState } from "react";
import type { Dispatch } from "react";
import { contactDetailsSchema } from "@govtech-bb/form-types";
import type { ContactDetails } from "@govtech-bb/form-types";
import type { RecipeAction } from "./-recipe-reducer";

// A validation issue joins its (dotted) path with its message, or shows the
// bare message for a top-level issue. `path` is Zod's `PropertyKey[]`.
function formatIssues(
  issues: { path: PropertyKey[]; message: string }[],
): string[] {
  return issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export interface ContactDetailsForm {
  title: string;
  setTitle: (v: string) => void;
  telephoneNumber: string;
  setTelephoneNumber: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  line1: string;
  setLine1: (v: string) => void;
  line2: string;
  setLine2: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  errors: string[];
  savedNotice: boolean;
  /** Fill the fields from a selected contact's details; clears errors + notice. */
  fill: (details: ContactDetails) => void;
  /** Reset every field to empty; clears errors + notice. */
  reset: () => void;
  /** Validate the fields and, if valid, dispatch UPDATE_CONTACT_DETAILS. */
  save: () => void;
}

interface ContactDetailsFields {
  title: string;
  telephoneNumber: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  country: string;
}

// Spread a selected contact's details across the flat string fields, collapsing
// absent values (and the optional address group) to "".
function detailsToFields(details: ContactDetails): ContactDetailsFields {
  return {
    title: details.title ?? "",
    telephoneNumber: details.telephoneNumber ?? "",
    email: details.email ?? "",
    line1: details.address?.line1 ?? "",
    line2: details.address?.line2 ?? "",
    city: details.address?.city ?? "",
    country: details.address?.country ?? "",
  };
}

// Build the candidate contactDetails from the current field values. Blank
// public fields drop to absent (they're all optional now, issue #607) rather
// than persisting "" the schema's min(1)/email() rules would reject. The
// address is all-or-nothing: every field blank omits the group; otherwise
// line1/city are included (blank or not) so the schema enforces them.
function buildContactDetails(f: ContactDetailsFields): ContactDetails {
  const hasAnyAddress = [f.line1, f.line2, f.city, f.country].some(
    (v) => v.trim() !== "",
  );
  return {
    ...(f.title.trim() ? { title: f.title.trim() } : {}),
    ...(f.telephoneNumber.trim()
      ? { telephoneNumber: f.telephoneNumber.trim() }
      : {}),
    ...(f.email.trim() ? { email: f.email.trim() } : {}),
    ...(hasAnyAddress
      ? {
          address: {
            line1: f.line1.trim(),
            ...(f.line2.trim() ? { line2: f.line2.trim() } : {}),
            city: f.city.trim(),
            ...(f.country.trim() ? { country: f.country.trim() } : {}),
          },
        }
      : {}),
  };
}

/**
 * Owns the "Contact Details" manual form state (issue #452): the organisation
 * title, telephone, email and optional address, plus the validation errors and
 * saved notice. The fields validate against `contactDetailsSchema` and commit
 * only on explicit `save`. Extracted from ContactDetailsEditor unchanged.
 */
export function useContactDetailsForm(
  existing: ContactDetails | undefined,
  dispatch: Dispatch<RecipeAction>,
): ContactDetailsForm {
  // Seed the fields from the existing details once, via the same absent-→-""
  // mapping a later selection uses.
  const initial = detailsToFields(existing ?? {});
  const [title, setTitle] = useState(initial.title);
  const [telephoneNumber, setTelephoneNumber] = useState(
    initial.telephoneNumber,
  );
  const [email, setEmail] = useState(initial.email);
  const [line1, setLine1] = useState(initial.line1);
  const [line2, setLine2] = useState(initial.line2);
  const [city, setCity] = useState(initial.city);
  const [country, setCountry] = useState(initial.country);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  function fill(details: ContactDetails) {
    const f = detailsToFields(details);
    setTitle(f.title);
    setTelephoneNumber(f.telephoneNumber);
    setEmail(f.email);
    setLine1(f.line1);
    setLine2(f.line2);
    setCity(f.city);
    setCountry(f.country);
    setErrors([]);
    setSavedNotice(false);
  }

  function reset() {
    setTitle("");
    setTelephoneNumber("");
    setEmail("");
    setLine1("");
    setLine2("");
    setCity("");
    setCountry("");
    setErrors([]);
    setSavedNotice(false);
  }

  function save() {
    const candidate = buildContactDetails({
      title,
      telephoneNumber,
      email,
      line1,
      line2,
      city,
      country,
    });

    const parsed = contactDetailsSchema.safeParse(candidate);
    if (!parsed.success) {
      setSavedNotice(false);
      setErrors(formatIssues(parsed.error.issues));
      return;
    }

    setErrors([]);
    setSavedNotice(true);
    dispatch({ type: "UPDATE_CONTACT_DETAILS", contactDetails: parsed.data });
  }

  return {
    title,
    setTitle,
    telephoneNumber,
    setTelephoneNumber,
    email,
    setEmail,
    line1,
    setLine1,
    line2,
    setLine2,
    city,
    setCity,
    country,
    setCountry,
    errors,
    savedNotice,
    fill,
    reset,
    save,
  };
}
