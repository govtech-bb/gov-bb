import { useStore, type AnyFormApi } from "@tanstack/react-form";
import { FormValues } from "@forms/types";

interface ApplicantNameDisplayProps {
  form: AnyFormApi;
}

/**
 * Field-id suffixes that identify the applicant's name parts, normalized to
 * lowercase with separators stripped. Recipes name these fields differently —
 * most use the `applicant-details` block (`applicant-first-name`, …), some use
 * camelCase ids (`firstName`, `otherNames`, … e.g. the temp-teacher form), and
 * forms filled in on a child's behalf name the applicant the parent/guardian
 * (`parent-first-name`, … e.g. the summer-camp form). Matching by normalized
 * field id lets one component resolve the name across all of them.
 */
const NAME_PART_IDS = {
  first: new Set(["firstname", "applicantfirstname", "parentfirstname"]),
  middle: new Set([
    "middlename",
    "applicantmiddlename",
    "othernames",
    "applicantothernames",
    "parentmiddlenames",
  ]),
  last: new Set(["lastname", "applicantlastname", "parentlastname"]),
};

const normalize = (value: string) => value.toLowerCase().replace(/[-_]/g, "");

/**
 * The field id is everything after the first `_` — the `${stepId}_` separator.
 * Step ids are hyphenated slugs so they never contain `_`, which keeps this
 * unambiguous (repeatable suffixes like `qualifications~1` stay on the stepId
 * side).
 */
const fieldIdOf = (key: string) => key.slice(key.indexOf("_") + 1);

/** First non-empty string value whose field id matches one of `ids`. */
function findNamePart(
  values: FormValues,
  ids: Set<string>,
): string | undefined {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (ids.has(normalize(fieldIdOf(key)))) return value;
  }
  return undefined;
}

/** The current local date formatted as DD/MM/YYYY. */
function formatToday(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function ApplicantNameDisplay({
  form,
}: ApplicantNameDisplayProps) {
  const formValues = useStore(
    form.store,
    (state) => state.values as FormValues,
  );

  const firstName = findNamePart(formValues, NAME_PART_IDS.first);
  const middleName = findNamePart(formValues, NAME_PART_IDS.middle);
  const lastName = findNamePart(formValues, NAME_PART_IDS.last);

  if (!firstName && !lastName) {
    return null;
  }

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

  return (
    <div className="form-page__applicant">
      <p>
        <strong>Applicant&apos;s name: </strong> {fullName}
      </p>
      <p>
        <strong>Date: </strong> {formatToday()}
      </p>
    </div>
  );
}
