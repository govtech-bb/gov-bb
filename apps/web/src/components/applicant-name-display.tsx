import { useStore } from "@tanstack/react-form";
import { FormValues } from "@web/types";

interface ApplicantNameDisplayProps {
  form: any;
}

export default function ApplicantNameDisplay({
  form,
}: ApplicantNameDisplayProps) {
  const formValues = useStore(
    form.store,
    (state: any) => state.values as FormValues,
  );

  // TODO: Standardize the way applicant's name is captured across forms, and update this logic accordingly. For example, we could require that all forms capture the applicant's first and last name in a consistent way (e.g. "applicant-first-name" and "applicant-last-name"), which would simplify this component and make it more reliable.
  const firstName =
    formValues["applicant-details_applicant-first-name"] ??
    formValues["personal-details_first-name"] ??
    undefined;
  const lastName =
    formValues["applicant-details_applicant-last-name"] ??
    formValues["personal-details_last-name"] ??
    undefined;

  if (!firstName && !lastName) {
    return null;
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div data-applicant-name>
      <p>
        <strong>Applicant: </strong> {fullName}
      </p>
      <p>
        <strong>Date: </strong> {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
